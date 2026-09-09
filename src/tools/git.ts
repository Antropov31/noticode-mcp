import { spawn } from "node:child_process";
import { z } from "zod";
import type { NotiTool } from "./types.js";
import { assertNotEmergencyStopped } from "../emergency-stop.js";

async function git(args: string[], cwd: string, timeout: number): Promise<string> {
  assertNotEmergencyStopped();
  return await new Promise<string>((resolve) => {
    const child = spawn("git", args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value.slice(0, 8000));
    };
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      finish(`git ${args.join(" ")} timed out after ${timeout} ms.\n${stdout}\n${stderr}`.trim());
    }, timeout);

    child.stdout?.on("data", (d) => { stdout += d.toString(); });
    child.stderr?.on("data", (d) => { stderr += d.toString(); });
    child.on("error", (e: any) => finish(`git failed: ${e?.message ?? e}`));
    child.on("close", (code) => {
      const out = [stdout, stderr].filter(Boolean).join("\n").trim();
      if (code === 0) finish(out || "(no output)");
      else finish(`git ${args.join(" ")} failed (exit ${code ?? "?"}):\n${out}`);
    });
  });
}

export const gitRun: NotiTool = {
  name: "git_run",
  description:
    "Run a git command in the workspace (e.g. status, diff, log, add, commit, branch, checkout, pull, push, stash). " +
    "Shell access is not required — this is the safe, scoped way for the agent to inspect and manage version control. " +
    "Destructive/remote commands (push --force, reset --hard, clean, etc.) are blocked unless `force` is set.",
  schema: z.object({
    args: z.array(z.string()).describe("git arguments, e.g. ['commit','-m','fix bug'] or ['log','--oneline','-5']."),
    force: z.boolean().optional().describe("Required for potentially destructive commands (reset --hard, clean -f, push --force, checkout .)."),
  }),
  handler: async (args, ctx) => {
    if (!args.args?.length) throw new Error("Provide git arguments, e.g. { args: ['status'] }.");
    const blocked = ["reset --hard", "clean", "push --force", "push -f", "checkout .", "checkout --", "branch -D"];
    const joined = args.args.join(" ");
    const dangerous = blocked.some((b) => joined.includes(b));
    if (dangerous && !args.force) {
      throw new Error(`Refusing destructive git command "${joined}" without force: true.`);
    }
    return git(args.args, ctx.workspace, 60000);
  },
};
