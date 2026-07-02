import { z } from "zod";
import { promisify } from "node:util";
import { exec as _exec, spawn } from "node:child_process";
import type { NotiTool } from "./types.js";

const exec = promisify(_exec);

export const processList: NotiTool = {
  name: "process_list",
  description:
    "List running processes with pid, name and CPU/memory usage. Optionally filter by a name substring. Use it to see what's running before starting or killing something.",
  schema: z.object({
    filter: z.string().optional().describe("Only processes whose name/command contains this substring (case-insensitive)."),
    limit: z.number().int().optional().describe("Maximum rows to return (default: 40)."),
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
    return out.slice(0, ctx.maxOutputChars);
  },
};

export const processStart: NotiTool = {
  name: "process_start",
  description:
    "Start a program by command/executable, detached from the agent, with optional arguments. Returns the new pid. Use desktop_open for documents/URLs; use this to launch a specific executable directly.",
  schema: z.object({
    command: z.string().describe("Executable or command to run, e.g. 'node', 'python3', '/usr/bin/firefox'."),
    args: z.array(z.string()).optional().describe("Arguments to pass to the command."),
    cwd: z.string().optional().describe("Working directory (default: workspace root)."),
  }),
  handler: async (args, ctx) => {
    const child = spawn(args.command, args.args ?? [], {
      cwd: args.cwd ?? ctx.workspace,
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return `Started "${args.command}"${args.args?.length ? ` ${args.args.join(" ")}` : ""} (pid ${child.pid}).`;
  },
};

export const processKill: NotiTool = {
  name: "process_kill",
  description:
    "Terminate a process by pid or by name. By default asks it to close gracefully; set force to kill hard. Killing by name stops all matching processes.",
  schema: z.object({
    pid: z.number().int().optional().describe("Process id to kill."),
    name: z.string().optional().describe("Process name to kill (all matching)."),
    force: z.boolean().optional().describe("Force kill (SIGKILL / taskkill /F)."),
  }),
  handler: async (args) => {
    if (args.pid == null && !args.name) throw new Error("Provide pid or name.");
    const win = process.platform === "win32";
    if (args.pid != null) {
      const cmd = win
        ? `taskkill ${args.force ? "/F " : ""}/PID ${args.pid}`
        : `kill ${args.force ? "-9 " : ""}${args.pid}`;
      await exec(cmd);
      return `Killed pid ${args.pid}.`;
    }
    const name = args.name as string;
    const cmd = win
      ? `taskkill ${args.force ? "/F " : ""}/IM ${name}`
      : `pkill ${args.force ? "-9 " : ""}-f ${JSON.stringify(name)}`;
    await exec(cmd);
    return `Killed processes matching "${name}".`;
  },
};
