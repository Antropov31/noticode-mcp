import { z } from "zod";
import type { NotiTool } from "./types.js";
import { importOptional } from "./optional.js";
import { findOnScreen, RegionSchema } from "./vision.js";

const HINT = "Run `npm install`. On Linux, input control also needs libxtst (and an X session).";

async function nut(): Promise<any> {
  return importOptional("@nut-tree-fork/nut-js", HINT);
}

function resolveButton(Button: any, name?: string) {
  return name === "right" ? Button.RIGHT : name === "middle" ? Button.MIDDLE : Button.LEFT;
}

export const clickElement: NotiTool = {
  name: "click_element",
  description:
    "Click an on-screen element by its visible text in one step: OCR the screen, find the best match, move the cursor there and click. Use this instead of guessing coordinates. Supports left/right/middle, double-click, and picking the Nth match.",
  schema: z.object({
    text: z.string().describe("Visible text of the element to click (case-insensitive substring, e.g. 'Save', 'Sign in')."),
    button: z.enum(["left", "right", "middle"]).optional().describe("Which button (default: left)."),
    double: z.boolean().optional().describe("Double-click instead of single."),
    index: z.number().int().optional().describe("Which match to click when several are found, 0-based (default: 0 = best match)."),
    region: RegionSchema.optional().describe("Restrict the search to this rectangle."),
    lang: z.string().optional().describe("OCR language(s), e.g. 'eng', 'rus', 'eng+rus' (default: eng)."),
    display: z.number().int().optional().describe("Display index for multi-monitor setups."),
  }),
  handler: async (args) => {
    const matches = await findOnScreen(args.text, {
      display: args.display,
      region: args.region,
      lang: args.lang,
      limit: Math.max(1, (args.index ?? 0) + 1),
    });
    if (!matches.length) throw new Error(`No on-screen element matching "${args.text}".`);
    const target = matches[Math.min(args.index ?? 0, matches.length - 1)];
    const { mouse, Point, Button } = await nut();
    await mouse.setPosition(new Point(target.center.x, target.center.y));
    const btn = resolveButton(Button, args.button);
    if (args.double) await mouse.doubleClick(btn);
    else await mouse.click(btn);
    return `${args.double ? "Double-clicked" : "Clicked"} "${target.text}" at (${target.center.x}, ${target.center.y}).`;
  },
};

export const waitFor: NotiTool = {
  name: "wait_for",
  description:
    "Wait until on-screen text appears (or disappears), polling with OCR, up to a timeout. Use it to wait for a page/app to finish loading before acting, instead of clicking into a screen that isn't ready.",
  schema: z.object({
    text: z.string().describe("Text to wait for (case-insensitive substring)."),
    until: z.enum(["appears", "disappears"]).optional().describe("Wait for the text to appear (default) or disappear."),
    timeout_ms: z.number().int().optional().describe("Give up after this many ms (default: 15000)."),
    interval_ms: z.number().int().optional().describe("How often to re-check the screen, in ms (default: 1000)."),
    region: RegionSchema.optional().describe("Restrict the search to this rectangle (faster)."),
    lang: z.string().optional().describe("OCR language(s), e.g. 'eng', 'rus', 'eng+rus' (default: eng)."),
    display: z.number().int().optional().describe("Display index for multi-monitor setups."),
  }),
  handler: async (args) => {
    const until = args.until ?? "appears";
    const timeout = args.timeout_ms ?? 15000;
    const interval = args.interval_ms ?? 1000;
    const started = Date.now();
    let checks = 0;
    while (Date.now() - started < timeout) {
      checks++;
      const matches = await findOnScreen(args.text, {
        display: args.display,
        region: args.region,
        lang: args.lang,
        limit: 1,
      });
      const present = matches.length > 0;
      if ((until === "appears" && present) || (until === "disappears" && !present)) {
        const elapsed = Date.now() - started;
        if (until === "appears") {
          const m = matches[0];
          return `"${args.text}" appeared after ${elapsed}ms (at (${m.center.x}, ${m.center.y})).`;
        }
        return `"${args.text}" disappeared after ${elapsed}ms.`;
      }
      const remaining = timeout - (Date.now() - started);
      if (remaining <= 0) break;
      await new Promise((r) => setTimeout(r, Math.min(interval, remaining)));
    }
    throw new Error(`Timed out after ${timeout}ms waiting for "${args.text}" to ${until} (${checks} checks).`);
  },
};
