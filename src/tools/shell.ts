import { exec } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { NotiTool } from "./types.js";
import { assertShellAllowed, truncateText } from "./types.js";
import { resolveWorkspacePath } from "./paths.js";

const pexec = promisify(exec);

export const shellExec: NotiTool = {
  name: "shell_exec",
  description:
    "Run a shell command on the host machine and return combined stdout/stderr. " +
    "PRIVILEGED: unlike fs_* tools (sandboxed to the workspace), the shell starts in the " +
    "workspace but can cd anywhere and touch any path the OS user can — treat as full local-user access.",
  schema: z.object({
    command: z.string().describe("The shell command to execute."),
    cwd: z.string().optional().describe("Working directory (default: workspace)."),
    timeout_ms: z.number().int().min(1).max(15 * 60 * 1000).optional().describe("Kill the command after this many ms (default: 120000)."),
  }),
  handler: async (args, ctx) => {
    assertShellAllowed(ctx);
    const cwd = await resolveWorkspacePath(ctx, args.cwd || ".");
    try {
      const { stdout, stderr } = await pexec(args.command, {
        cwd,
        timeout: args.timeout_ms ?? 120000,
        maxBuffer: 10 * 1024 * 1024,
        shell: process.platform === "win32" ? undefined : "/bin/bash",
      });
      const out = [stdout, stderr].filter(Boolean).join("\n").trim();
      return truncateText(out || "(no output)", ctx.maxOutputChars);
    } catch (e: any) {
      const body = `Command failed (exit ${e.code ?? "?"}):\n${e.stdout || ""}\n${e.stderr || e.message || ""}`;
      return truncateText(body, ctx.maxOutputChars);
    }
  },
};
