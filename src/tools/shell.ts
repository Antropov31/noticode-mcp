import { exec } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { NotiTool } from "./types.js";

const pexec = promisify(exec);

export const shellExec: NotiTool = {
  name: "shell_exec",
  description:
    "Run a shell command on the host machine and return combined stdout/stderr. Full system access.",
  schema: z.object({
    command: z.string().describe("The shell command to execute."),
    cwd: z.string().optional().describe("Working directory (default: workspace)."),
    timeout_ms: z.number().int().optional().describe("Kill the command after this many ms (default: 120000)."),
  }),
  handler: async (args, ctx) => {
    if (!ctx.allowShell) throw new Error("Shell execution is disabled (NOTICODE_ALLOW_SHELL=false).");
    try {
      const { stdout, stderr } = await pexec(args.command, {
        cwd: args.cwd || ctx.workspace,
        timeout: args.timeout_ms ?? 120000,
        maxBuffer: 10 * 1024 * 1024,
        shell: process.platform === "win32" ? undefined : "/bin/bash",
      });
      const out = [stdout, stderr].filter(Boolean).join("\n").trim();
      return out.slice(0, ctx.maxOutputChars) || "(no output)";
    } catch (e: any) {
      const body = `Command failed (exit ${e.code ?? "?"}):\n${e.stdout || ""}\n${e.stderr || e.message || ""}`;
      return body.slice(0, ctx.maxOutputChars);
    }
  },
};
