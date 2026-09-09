import fs from "node:fs/promises";
import path from "node:path";
import type { ToolContext } from "./types.js";

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function resolveLexically(ctx: ToolContext, input: string): string {
  if (!input.trim()) throw new Error("Path must not be empty.");
  const candidate = path.resolve(ctx.workspace, input);
  if (!isInside(path.resolve(ctx.workspace), candidate)) {
    throw new Error(`Path must stay inside the workspace: ${input}`);
  }
  return candidate;
}

/** Resolve a path and reject symlinks/junctions that escape the workspace. */
export async function resolveWorkspacePath(
  ctx: ToolContext,
  input: string,
  options: { allowMissing?: boolean } = {},
): Promise<string> {
  const candidate = resolveLexically(ctx, input);
  const workspaceRoot = await fs.realpath(ctx.workspace);
  let current = candidate;

  while (true) {
    try {
      const real = await fs.realpath(current);
      if (!isInside(workspaceRoot, real)) {
        throw new Error(`Path resolves outside the workspace: ${input}`);
      }
      return candidate;
    } catch (error: any) {
      if (!options.allowMissing || (error?.code !== "ENOENT" && error?.code !== "ENOTDIR")) {
        throw error;
      }
      const parent = path.dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

export function assertSafeGlob(pattern: string): void {
  if (!pattern.trim()) throw new Error("Glob must not be empty.");
  if (pattern.includes("\0") || path.isAbsolute(pattern)) {
    throw new Error("Glob must be relative to the workspace.");
  }
  const segments = pattern.split(/[\\/]+/);
  if (segments.includes("..")) {
    throw new Error("Glob must not contain parent-directory segments.");
  }
}
