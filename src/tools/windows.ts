import { z } from "zod";
import type { NotiTool } from "./types.js";
import { importOptional } from "./optional.js";

async function wm(): Promise<any> {
  return importOptional(
    "node-window-manager",
    "Run `npm install`. Window management needs node-window-manager (Linux also needs an X session).",
  );
}

/** Safely read a window's title. */
function titleOf(win: any): string {
  try {
    return (typeof win.getTitle === "function" ? win.getTitle() : "") || "";
  } catch {
    return "";
  }
}

/** Safely read a window's bounds. */
function boundsOf(win: any): { x: number; y: number; width: number; height: number } {
  try {
    const b = typeof win.getBounds === "function" ? win.getBounds() : null;
    return { x: b?.x ?? 0, y: b?.y ?? 0, width: b?.width ?? 0, height: b?.height ?? 0 };
  } catch {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
}

/** Find a window by id, or by a case-insensitive title substring. */
function findWindow(windowManager: any, target: { id?: number; title?: string }): any {
  const wins = windowManager.getWindows();
  if (target.id != null) return wins.find((w: any) => w.id === target.id);
  const t = (target.title ?? "").toLowerCase();
  return wins.find((w: any) => titleOf(w).toLowerCase().includes(t));
}

export const windowList: NotiTool = {
  name: "window_list",
  description:
    "List open windows with their id, title and screen bounds (x, y, width, height). Use it to see what's on screen and to pick a window to focus or move.",
  schema: z.object({
    filter: z.string().optional().describe("Only windows whose title contains this substring (case-insensitive)."),
  }),
  handler: async (args) => {
    const { windowManager } = await wm();
    const f = args.filter?.toLowerCase();
    const rows = windowManager
      .getWindows()
      .map((w: any) => ({ id: w.id, title: titleOf(w), bounds: boundsOf(w) }))
      .filter((w: any) => w.title && (!f || w.title.toLowerCase().includes(f)));
    if (!rows.length) return "No matching windows.";
    return rows
      .map((w: any) => `#${w.id} "${w.title}" [${w.bounds.x},${w.bounds.y} ${w.bounds.width}x${w.bounds.height}]`)
      .join("\n");
  },
};

export const windowActive: NotiTool = {
  name: "window_active",
  description:
    "Return the currently focused/active window's id, title and bounds. Use it to know what the user is looking at right now.",
  schema: z.object({}),
  handler: async () => {
    const { windowManager } = await wm();
    const w = windowManager.getActiveWindow();
    if (!w) return "No active window detected.";
    const b = boundsOf(w);
    return `Active: #${w.id} "${titleOf(w)}" [${b.x},${b.y} ${b.width}x${b.height}]`;
  },
};

export const windowFocus: NotiTool = {
  name: "window_focus",
  description:
    "Bring a window to the front and focus it, targeted by window id or a title substring. Use before typing or clicking into a specific app.",
  schema: z.object({
    id: z.number().int().optional().describe("Window id from window_list."),
    title: z.string().optional().describe("Title substring to match (case-insensitive)."),
  }),
  handler: async (args) => {
    if (args.id == null && !args.title) throw new Error("Provide id or title.");
    const { windowManager } = await wm();
    const win = findWindow(windowManager, { id: args.id, title: args.title });
    if (!win) throw new Error("No matching window.");
    if (typeof win.restore === "function") win.restore();
    if (typeof win.bringToTop === "function") win.bringToTop();
    return `Focused #${win.id} "${titleOf(win)}".`;
  },
};

export const windowMove: NotiTool = {
  name: "window_move",
  description:
    "Move and/or resize a window (targeted by id or title substring) to the given bounds, and/or change its state (maximize, minimize, restore). Great for arranging the workspace before acting.",
  schema: z.object({
    id: z.number().int().optional().describe("Window id from window_list."),
    title: z.string().optional().describe("Title substring to match (case-insensitive)."),
    x: z.number().int().optional().describe("New left position in pixels."),
    y: z.number().int().optional().describe("New top position in pixels."),
    width: z.number().int().optional().describe("New width in pixels."),
    height: z.number().int().optional().describe("New height in pixels."),
    state: z.enum(["maximize", "minimize", "restore"]).optional().describe("Window state change."),
  }),
  handler: async (args) => {
    if (args.id == null && !args.title) throw new Error("Provide id or title.");
    const { windowManager } = await wm();
    const win = findWindow(windowManager, { id: args.id, title: args.title });
    if (!win) throw new Error("No matching window.");
    if (args.state === "maximize" && typeof win.maximize === "function") win.maximize();
    else if (args.state === "minimize" && typeof win.minimize === "function") win.minimize();
    else if (args.state === "restore" && typeof win.restore === "function") win.restore();
    if (args.x != null || args.y != null || args.width != null || args.height != null) {
      const b = boundsOf(win);
      if (typeof win.setBounds === "function") {
        win.setBounds({
          x: args.x ?? b.x,
          y: args.y ?? b.y,
          width: args.width ?? b.width,
          height: args.height ?? b.height,
        });
      }
    }
    return `Updated window #${win.id} "${titleOf(win)}".`;
  },
};
