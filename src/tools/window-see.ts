import { z } from "zod";
import type { NotiTool } from "./types.js";
import { importOptional } from "./optional.js";
import { grabScreen, processImage, toImage, type Region } from "./vision.js";

async function wm(): Promise<any> {
  return importOptional(
    "node-window-manager",
    "Run `npm install`. Window capture needs node-window-manager (Linux also needs an X session).",
  );
}

function titleOf(win: any): string {
  try {
    return (typeof win.getTitle === "function" ? win.getTitle() : "") || "";
  } catch {
    return "";
  }
}

function boundsOf(win: any): Region {
  try {
    const b = typeof win.getBounds === "function" ? win.getBounds() : null;
    return { x: b?.x ?? 0, y: b?.y ?? 0, width: b?.width ?? 0, height: b?.height ?? 0 };
  } catch {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
}

export const windowSee: NotiTool = {
  name: "window_see",
  description:
    "Look at a single window right now: screenshot just the active window (or one matched by id/title) and return it as an inline image the agent can directly see. Cleaner than a full-screen shot when you only care about one app. Optionally focus it first so it isn't occluded.",
  schema: z.object({
    id: z.number().int().optional().describe("Window id from window_list (default: the active window)."),
    title: z.string().optional().describe("Title substring to match (case-insensitive) instead of id."),
    focus: z.boolean().optional().describe("Bring the window to the front before capturing (default: true)."),
    scale: z.number().optional().describe("Downscale factor 0-1 to save tokens (default: 1 = full size)."),
  }),
  handler: async (args) => {
    const { windowManager } = await wm();
    let win: any;
    if (args.id != null) {
      win = windowManager.getWindows().find((w: any) => w.id === args.id);
    } else if (args.title) {
      const t = args.title.toLowerCase();
      win = windowManager.getWindows().find((w: any) => titleOf(w).toLowerCase().includes(t));
    } else {
      win = windowManager.getActiveWindow();
    }
    if (!win) throw new Error("No matching window.");

    if (args.focus ?? true) {
      if (typeof win.restore === "function") win.restore();
      if (typeof win.bringToTop === "function") win.bringToTop();
      await new Promise((r) => setTimeout(r, 150));
    }

    const b = boundsOf(win);
    const raw = await grabScreen();
    const region = b.width > 0 && b.height > 0 ? b : undefined;
    const buf = await processImage(raw, { region, scale: args.scale });
    const title = titleOf(win) || `#${win.id}`;
    return { text: `Here is window \"${title}\".`, images: [toImage(buf)] };
  },
};
