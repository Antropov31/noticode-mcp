import { z } from "zod";
import { promisify } from "node:util";
import { exec as _exec, spawn } from "node:child_process";
import type { NotiTool } from "./types.js";
import { assertShellAllowed, truncateText } from "./types.js";
import { resolveWorkspacePath } from "./paths.js";

const exec = promisify(_exec);

export const processList: NotiTool = {
  name: "process_list",
  description:
    "List running processes with pid, name and CPU/memory usage. Optionally filter by a name substring. Use it to see what's running before starting or killing something.",
  schema: z.object({
    filter: z.string().optional().describe("Only processes whose name/command contains this substring (case-insensitive)."),
    limit: z.number().int().min(1).max(1000).optional().describe("Maximum rows to return (default: 40)."),
  }),
  handler: async (args, ctx) => {
    const limit = args.limit ?? 40;
    let rows: Array<{ pid: string; cpu: string; mem: string; name: string }> = [];
    if (process.platform === "win32") {
      const { stdout } = await exec("tasklist /fo csv /nh");
      rows = stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const cols = line.split(",").map((c) => c.replace(/^\"|\"$/g, ""));
          return { pid: cols[1] ?? "", cpu: "", mem: cols[4] ?? "", name: cols[0] ?? "" };
        });
    } else {
      const { stdout } = await exec("ps -Ao pid,pcpu,pmem,comm");
      const lines = stdout.split(/\r?\n/).slice(1).filter(Boolean);
      rows = lines.map((line) => {
        const m = line.trim().match(/^(\d+)\s+(\S+)\s+(\S+)\s+(.*)$/);
        return m
          ? { pid: m[1], cpu: m[2], mem: m[3], name: m[4] }
          : { pid: "", cpu: "", mem: "", name: line.trim() };
      });
    }
    const f = args.filter?.toLowerCase();
    const filtered = rows.filter((r) => r.name && (!f || r.name.toLowerCase().includes(f)));
    if (!filtered.length) return "No matching processes.";
    const out = filtered
      .slice(0, limit)
      .map((r) => `${r.pid}\t${r.cpu ? `cpu ${r.cpu}% ` : ""}${r.mem ? `mem ${r.mem} ` : ""}${r.name}`)
      .join("\n");
    return truncateText(out, ctx.maxOutputChars);
  },
};

export const processStart: NotiTool = {
  name: "process_start",
  description:
    "Start a program by command/executable, detached from the agent, with optional arguments. Returns the new pid. Use desktop_open for documents/URLs; use this to launch a specific executable directly.",
  schema: z.object({
    command: z.string().trim().min(1).describe("Executable or command to run, e.g. 'node', 'python3', '/usr/bin/firefox'."),
    args: z.array(z.string()).optional().describe("Arguments to pass to the command."),
    cwd: z.string().optional().describe("Working directory (default: workspace root)."),
  }),
  handler: async (args, ctx) => {
    assertShellAllowed(ctx);
    const cwd = await resolveWorkspacePath(ctx, args.cwd ?? ".");
    const pid = await startDetached(args.command, args.args ?? [], cwd);
    const renderedArgs = args.args?.length ? ` ${args.args.join(" ")}` : "";
    return `Started "${args.command}"${renderedArgs} in ${cwd} (pid ${pid ?? "?"}).`;
  },
};

export const processKill: NotiTool = {
  name: "process_kill",
  description:
    "Terminate a process by pid or by name. By default asks it to close gracefully; set force to kill hard. Killing by name stops all matching processes.",
  schema: z.object({
    pid: z.number().int().positive().optional().describe("Process id to kill."),
    name: z.string().trim().min(1).max(260).optional().describe("Process name to kill (all matching)."),
    force: z.boolean().optional().describe("Force kill (SIGKILL / taskkill /F)."),
  }),
  handler: async (args, ctx) => {
    assertShellAllowed(ctx);
    if (args.pid == null && !args.name) throw new Error("Provide pid or name.");
    const win = process.platform === "win32";
    if (args.pid != null) {
      await runCommand(win ? "taskkill" : "kill", win
        ? [...(args.force ? ["/F"] : []), "/PID", String(args.pid)]
        : [...(args.force ? ["-9"] : []), String(args.pid)]);
      return `Killed pid ${args.pid}.`;
    }
    const name = args.name as string;
    await runCommand(win ? "taskkill" : "pkill", win
      ? [...(args.force ? ["/F"] : []), "/IM", name]
      : [...(args.force ? ["-9"] : []), "-f", name]);
    return `Killed processes matching "${name}".`;
  },
};

function startDetached(command: string, args: string[], cwd: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve(child.pid);
    });
  });
}

function runCommand(command: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true });
    let stderr = "";
    child.stderr?.on("data", (data) => { stderr += data.toString(); });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? "?"}${stderr.trim() ? `: ${stderr.trim()}` : ""}`));
    });
  });
}
