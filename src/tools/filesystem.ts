import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { z } from "zod";
import type { NotiTool, ToolContext } from "./types.js";

function resolve(ctx: ToolContext, p: string): string {
  return path.resolve(ctx.workspace, p);
}

export const readFile: NotiTool = {
  name: "fs_read",
  description:
    "Read a UTF-8 text file. Returns the full content, or a line range when start_line/end_line are given.",
  schema: z.object({
    path: z.string().describe("File path, absolute or relative to the workspace."),
    start_line: z.number().int().optional().describe("1-based first line to return."),
    end_line: z.number().int().optional().describe("1-based last line to return."),
  }),
  handler: async (args, ctx) => {
    const full = resolve(ctx, args.path);
    const raw = await fs.readFile(full, "utf8");
    if (args.start_line || args.end_line) {
      const lines = raw.split("\n");
      const s = (args.start_line ?? 1) - 1;
      const e = args.end_line ?? lines.length;
      return lines.slice(s, e).join("\n");
    }
    return raw.slice(0, ctx.maxOutputChars);
  },
};

export const writeFile: NotiTool = {
  name: "fs_write",
  description:
    "Create or overwrite a file with the given content. Parent directories are created automatically.",
  schema: z.object({
    path: z.string(),
    content: z.string(),
  }),
  handler: async (args, ctx) => {
    if (!ctx.allowWrite) throw new Error("Writing is disabled (NOTICODE_ALLOW_WRITE=false).");
    const full = resolve(ctx, args.path);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, args.content, "utf8");
    return `Wrote ${args.content.length} bytes to ${full}`;
  },
};

export const editFile: NotiTool = {
  name: "fs_edit",
  description:
    "Replace an exact substring in a file. old_string must match exactly once unless replace_all is true.",
  schema: z.object({
    path: z.string(),
    old_string: z.string(),
    new_string: z.string(),
    replace_all: z.boolean().optional(),
  }),
  handler: async (args, ctx) => {
    if (!ctx.allowWrite) throw new Error("Writing is disabled (NOTICODE_ALLOW_WRITE=false).");
    const full = resolve(ctx, args.path);
    const raw = await fs.readFile(full, "utf8");
    const count = raw.split(args.old_string).length - 1;
    if (count === 0) throw new Error("old_string was not found in the file.");
    if (count > 1 && !args.replace_all) {
      throw new Error(`old_string matched ${count} times; pass replace_all or add more surrounding context.`);
    }
    const out = args.replace_all
      ? raw.split(args.old_string).join(args.new_string)
      : raw.replace(args.old_string, args.new_string);
    await fs.writeFile(full, out, "utf8");
    return `Edited ${full} (${count} replacement${count > 1 ? "s" : ""}).`;
  },
};

export const listDir: NotiTool = {
  name: "fs_list",
  description: "List files and directories under a path, up to a given depth.",
  schema: z.object({
    path: z.string().optional().describe("Directory to list (default: workspace root)."),
    depth: z.number().int().optional().describe("How deep to recurse (default: 2)."),
  }),
  handler: async (args, ctx) => {
    const base = resolve(ctx, args.path ?? ".");
    const entries = await fg("**/*", {
      cwd: base,
      deep: args.depth ?? 2,
      onlyFiles: false,
      dot: false,
      markDirectories: true,
      ignore: ["**/node_modules/**", "**/.git/**"],
    });
    return entries.slice(0, 500).join("\n") || "(empty)";
  },
};

export const search: NotiTool = {
  name: "fs_search",
  description:
    "Find files by glob pattern. If query is set, also returns matching lines inside those files (grep-style).",
  schema: z.object({
    glob: z.string().optional().describe("Glob pattern, e.g. **/*.ts (default: everything)."),
    query: z.string().optional().describe("Substring to search for inside matched files."),
  }),
  handler: async (args, ctx) => {
    const files = await fg(args.glob ?? "**/*", {
      cwd: ctx.workspace,
      ignore: ["**/node_modules/**", "**/.git/**"],
      dot: false,
    });
    if (!args.query) return files.slice(0, 200).join("\n") || "(no matches)";
    const hits: string[] = [];
    for (const f of files.slice(0, 2000)) {
      try {
        const raw = await fs.readFile(path.resolve(ctx.workspace, f), "utf8");
        raw.split("\n").forEach((ln, i) => {
          if (ln.includes(args.query!)) hits.push(`${f}:${i + 1}: ${ln.trim().slice(0, 200)}`);
        });
      } catch {
        // skip binary / unreadable files
      }
      if (hits.length > 200) break;
    }
    return hits.join("\n") || "(no matches)";
  },
};
