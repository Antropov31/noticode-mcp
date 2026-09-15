import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import type { RunnerConfig } from "../config.js";

interface ProcessResult { code: number; stdout: string; stderr: string }

function crop(text: string, max = 60_000): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n...[truncated ${text.length - max} chars]`;
}

async function runProcess(command: string, args: string[], cwd: string, shell = false): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell, windowsHide: true, env: process.env });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => (stdout += String(chunk)));
    child.stderr?.on("data", (chunk) => (stderr += String(chunk)));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, stdout: crop(stdout), stderr: crop(stderr) }));
  });
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9._/-]+/g, "-").replace(/^[-/.]+|[-/.]+$/g, "").slice(0, 120) || "item";
}

function within(candidate: string, root: string): boolean {
  const a = path.resolve(candidate);
  const b = path.resolve(root);
  const aa = process.platform === "win32" ? a.toLowerCase() : a;
  const bb = process.platform === "win32" ? b.toLowerCase() : b;
  return aa === bb || aa.startsWith(bb + path.sep);
}

async function exists(filename: string): Promise<boolean> {
  try { await fs.stat(filename); return true; } catch { return false; }
}

export class LocalRunner {
  constructor(private readonly config: RunnerConfig) {}

  private validateRoot(rootValue: unknown): string {
    const root = path.resolve(String(rootValue || this.config.workspace));
    if (!within(root, this.config.workspace) && !within(root, this.config.worktreeRoot)) {
      throw new Error(`Runner root outside allowed areas: ${root}`);
    }
    return root;
  }

  private resolvePath(rootValue: unknown, relativeValue: unknown): string {
    const root = this.validateRoot(rootValue);
    const relative = String(relativeValue || ".");
    const target = path.resolve(root, relative);
    if (!within(target, root)) throw new Error("Path escapes runner root");
    return target;
  }

  private async createWorktree(params: Record<string, any>) {
    const swarmId = sanitize(String(params.swarmId || "swarm"));
    const agentId = sanitize(String(params.agentId || "agent"));
    const taskId = sanitize(String(params.taskId || "task"));
    const target = path.resolve(this.config.worktreeRoot, `${swarmId}-${agentId}`);
    if (!within(target, this.config.worktreeRoot)) throw new Error("Invalid worktree target");
    const branch = `swarm/${swarmId}/${agentId}/${taskId}`;
    await fs.mkdir(this.config.worktreeRoot, { recursive: true });
    if (await exists(path.join(target, ".git"))) return { path: target, branch, existed: true };

    await runProcess("git", ["fetch", "origin", "--prune"], this.config.workspace).catch(() => ({ code: 1, stdout: "", stderr: "fetch failed" }));
    const probe = await runProcess("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], this.config.workspace);
    const result = probe.code === 0
      ? await runProcess("git", ["worktree", "add", target, branch], this.config.workspace)
      : await runProcess("git", ["worktree", "add", "-b", branch, target, this.config.baseRef], this.config.workspace);
    if (result.code !== 0) throw new Error(`git worktree add failed: ${result.stderr || result.stdout}`);
    return { path: target, branch, existed: false };
  }

  private validateExec(command: string): void {
    if (!this.config.allowExec) throw new Error("Generic runner exec is disabled. Set ANTRO_RUNNER_ALLOW_EXEC=true to opt in.");
    if (/[;&|`<>]|\$\(|\.\.[\\/]/.test(command)) throw new Error("Command contains blocked shell/control tokens");
    const first = command.trim().split(/\s+/)[0]?.toLowerCase();
    if (!first || !this.config.allowedPrefixes.some((x) => x.toLowerCase() === first)) {
      throw new Error(`Command prefix is not allowed: ${first || "(empty)"}`);
    }
  }

  async execute(action: string, params: Record<string, any>): Promise<any> {
    switch (action) {
      case "worktree.create":
        return this.createWorktree(params);
      case "worktree.list": {
        const result = await runProcess("git", ["worktree", "list", "--porcelain"], this.config.workspace);
        return result;
      }
      case "fs.read": {
        const target = this.resolvePath(params.root, params.path);
        return { path: target, content: await fs.readFile(target, "utf8") };
      }
      case "fs.write": {
        const target = this.resolvePath(params.root, params.path);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, String(params.content ?? ""), "utf8");
        return { path: target, bytes: Buffer.byteLength(String(params.content ?? ""), "utf8") };
      }
      case "fs.edit": {
        const target = this.resolvePath(params.root, params.path);
        const source = await fs.readFile(target, "utf8");
        const search = String(params.search ?? "");
        if (!search || !source.includes(search)) throw new Error("Exact edit search text was not found");
        const replacement = String(params.replace ?? "");
        const content = params.all ? source.split(search).join(replacement) : source.replace(search, replacement);
        await fs.writeFile(target, content, "utf8");
        return { path: target, changed: true };
      }
      case "fs.list": {
        const root = this.resolvePath(params.root, params.path ?? ".");
        const depth = Math.min(Math.max(Number(params.depth ?? 1), 0), 4);
        const walk = async (dir: string, level: number): Promise<any[]> => {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          const out: any[] = [];
          for (const entry of entries.slice(0, 500)) {
            const full = path.join(dir, entry.name);
            const item: any = { name: entry.name, path: path.relative(this.validateRoot(params.root), full), type: entry.isDirectory() ? "dir" : "file" };
            if (entry.isDirectory() && level < depth && entry.name !== ".git" && entry.name !== "node_modules") item.children = await walk(full, level + 1);
            out.push(item);
          }
          return out;
        };
        return walk(root, 0);
      }
      case "git.status": {
        const root = this.validateRoot(params.root);
        return runProcess("git", ["status", "--short", "--branch"], root);
      }
      case "git.diff": {
        const root = this.validateRoot(params.root);
        const args = ["diff"];
        if (params.cached) args.push("--cached");
        if (params.stat) args.push("--stat");
        return runProcess("git", args, root);
      }
      case "git.commit": {
        const root = this.validateRoot(params.root);
        const add = await runProcess("git", ["add", "-A"], root);
        if (add.code !== 0) throw new Error(add.stderr || add.stdout);
        const result = await runProcess("git", ["commit", "-m", String(params.message || "AntroSwarm agent changes")], root);
        if (result.code !== 0) throw new Error(result.stderr || result.stdout);
        return result;
      }
      case "git.push": {
        const root = this.validateRoot(params.root);
        const branchResult = await runProcess("git", ["rev-parse", "--abbrev-ref", "HEAD"], root);
        if (branchResult.code !== 0) throw new Error(branchResult.stderr);
        const branch = branchResult.stdout.trim();
        const result = await runProcess("git", ["push", "-u", "origin", branch], root);
        if (result.code !== 0) throw new Error(result.stderr || result.stdout);
        return { branch, ...result };
      }
      case "build": {
        const root = this.validateRoot(params.root);
        const result = await runProcess(this.config.buildCommand, [], root, true);
        return { command: this.config.buildCommand, ...result };
      }
      case "exec": {
        const root = this.validateRoot(params.root);
        const command = String(params.command || "");
        this.validateExec(command);
        return runProcess(command, [], root, true);
      }
      default:
        throw new Error(`Unsupported runner action: ${action}`);
    }
  }

  private websocketUrl(): string {
    const url = new URL(this.config.cloudUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/runner";
    url.search = "";
    return url.toString();
  }

  async start(): Promise<never> {
    await fs.mkdir(this.config.worktreeRoot, { recursive: true });
    for (;;) {
      try {
        await new Promise<void>((resolve) => {
          const ws = new WebSocket(this.websocketUrl());
          ws.on("open", () => {
            ws.send(JSON.stringify({
              type: "register",
              token: this.config.runnerToken,
              runnerId: this.config.runnerId,
              workspace: this.config.workspace,
              capabilities: ["worktree", "filesystem", "git", "build", ...(this.config.allowExec ? ["exec"] : [])],
            }));
          });
          ws.on("message", async (raw) => {
            let msg: any;
            try { msg = JSON.parse(raw.toString()); } catch { return; }
            if (msg.type !== "command" || !msg.requestId) return;
            try {
              const result = await this.execute(String(msg.action), msg.params ?? {});
              ws.send(JSON.stringify({ type: "result", requestId: msg.requestId, ok: true, result }));
            } catch (error: any) {
              ws.send(JSON.stringify({ type: "result", requestId: msg.requestId, ok: false, error: error?.message ?? String(error) }));
            }
          });
          ws.on("close", () => resolve());
          ws.on("error", () => { try { ws.close(); } catch {} });
        });
      } catch {}
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
