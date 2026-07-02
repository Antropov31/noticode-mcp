import { z } from "zod";
import type { NotiTool } from "./types.js";
import { importOptional } from "./optional.js";

const HINT = "Run `npm install`. On Linux, input control also needs libxtst (and an X session).";

async function nut(): Promise<any> {
  return importOptional("@nut-tree-fork/nut-js", HINT);
}

export const inputMove: NotiTool = {
  name: "input_move",
  description: "Move the mouse cursor to absolute screen coordinates (pixels from top-left).",
  schema: z.object({
    x: z.number().int().describe("X coordinate in pixels."),
    y: z.number().int().describe("Y coordinate in pixels."),
  }),
  handler: async (args) => {
    const { mouse, Point } = await nut();
    await mouse.setPosition(new Point(args.x, args.y));
    return `Moved cursor to (${args.x}, ${args.y}).`;
  },
};

export const inputClick: NotiTool = {
  name: "input_click",
  description:
    "Click a mouse button at the current cursor position, or at x/y first if both are provided.",
  schema: z.object({
    button: z.enum(["left", "right", "middle"]).optional().describe("Which button (default: left)."),
    x: z.number().int().optional().describe("Move here before clicking."),
    y: z.number().int().optional().describe("Move here before clicking."),
    double: z.boolean().optional().describe("Double-click instead of single."),
  }),
  handler: async (args) => {
    const { mouse, Point, Button } = await nut();
    if (args.x != null && args.y != null) await mouse.setPosition(new Point(args.x, args.y));
    const btn =
      args.button === "right" ? Button.RIGHT : args.button === "middle" ? Button.MIDDLE : Button.LEFT;
    if (args.double) await mouse.doubleClick(btn);
    else await mouse.click(btn);
    return `${args.double ? "Double-clicked" : "Clicked"} ${args.button ?? "left"} button.`;
  },
};

export const inputType: NotiTool = {
  name: "input_type",
  description: "Type a string of text into whatever currently has keyboard focus.",
  schema: z.object({ text: z.string().describe("Text to type.") }),
  handler: async (args) => {
    const { keyboard } = await nut();
    await keyboard.type(args.text);
    return `Typed ${args.text.length} characters.`;
  },
};

export const inputKey: NotiTool = {
  name: "input_key",
  description:
    "Press a special key or chord. Examples: 'enter', 'escape', 'tab', 'ctrl+c', 'cmd+shift+t'. Modifiers: ctrl, alt, shift, cmd/meta/super.",
  schema: z.object({ keys: z.string().describe("Key or chord, e.g. 'enter' or 'ctrl+s'.") }),
  handler: async (args) => {
    const { keyboard, Key } = await nut();
    const map: Record<string, any> = {
      enter: Key.Enter, return: Key.Enter, esc: Key.Escape, escape: Key.Escape,
      tab: Key.Tab, space: Key.Space, backspace: Key.Backspace, delete: Key.Delete, del: Key.Delete,
      up: Key.Up, down: Key.Down, left: Key.Left, right: Key.Right,
      home: Key.Home, end: Key.End, pageup: Key.PageUp, pagedown: Key.PageDown,
      ctrl: Key.LeftControl, control: Key.LeftControl, alt: Key.LeftAlt, option: Key.LeftAlt,
      shift: Key.LeftShift, cmd: Key.LeftSuper, command: Key.LeftSuper, meta: Key.LeftSuper, super: Key.LeftSuper,
    };
    const parts = args.keys.toLowerCase().split("+").map((p) => p.trim()).filter(Boolean);
    const keys = parts.map((p) => {
      const resolved =
        map[p] ??
        (p.length === 1
          ? (Key as any)[p.toUpperCase()]
          : (Key as any)[p[0].toUpperCase() + p.slice(1)]);
      if (resolved == null) throw new Error(`Unknown key: "${p}"`);
      return resolved;
    });
    await keyboard.pressKey(...keys);
    await keyboard.releaseKey(...keys);
    return `Pressed ${args.keys}.`;
  },
};

export const inputScroll: NotiTool = {
  name: "input_scroll",
  description: "Scroll the mouse wheel. Positive amount scrolls down, negative scrolls up.",
  schema: z.object({
    amount: z.number().int().describe("Wheel steps; positive = down, negative = up."),
  }),
  handler: async (args) => {
    const { mouse } = await nut();
    if (args.amount >= 0) await mouse.scrollDown(args.amount);
    else await mouse.scrollUp(-args.amount);
    return `Scrolled ${args.amount >= 0 ? "down" : "up"} ${Math.abs(args.amount)} steps.`;
  },
};
