import { z } from "zod";
import type { NotiTool } from "./types.js";
import { importOptional } from "./optional.js";

const HINT = "Run `npm install`. On Linux, input control also needs libxtst (and an X session).";

async function nut(): Promise<any> {
 return importOptional("@nut-tree-fork/nut-js", HINT);
}

/** Resolve a "left" | "right" | "middle" string to a nut-js Button enum value. */
function resolveButton(Button: any, name?: string) {
 return name === "right" ? Button.RIGHT : name === "middle" ? Button.MIDDLE : Button.LEFT;
}

/** Build a smoothly interpolated array of Points from (x1,y1) to (x2,y2). */
function lerpPath(Point: any, x1: number, y1: number, x2: number, y2: number, steps: number) {
 const n = Math.max(1, steps);
 const pts: any[] = [];
 for (let i = 0; i <= n; i++) {
 const t = i / n;
 pts.push(new Point(Math.round(x1 + (x2 - x1) * t), Math.round(y1 + (y2 - y1) * t)));
 }
 return pts;
}

/** Given a list of waypoints, return a Point[] path, optionally interpolating between them. */
function pathFromWaypoints(
 Point: any,
 waypoints: Array<{ x: number; y: number }>,
 smoothSteps: number,
) {
 const path: any[] = [new Point(Math.round(waypoints[0].x), Math.round(waypoints[0].y))];
 for (let i = 1; i < waypoints.length; i++) {
 const a = waypoints[i - 1];
 const b = waypoints[i];
 if (smoothSteps > 0) {
 const seg = lerpPath(Point, a.x, a.y, b.x, b.y, smoothSteps);
 for (let j = 1; j < seg.length; j++) path.push(seg[j]);
 } else {
 path.push(new Point(Math.round(b.x), Math.round(b.y)));
 }
 }
 return path;
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

export const inputMoveRelative: NotiTool = {
 name: "input_move_relative",
 description: "Move the mouse cursor by an offset (dx, dy) from its current position.",
 schema: z.object({
 dx: z.number().int().describe("Horizontal offset in pixels (positive = right)."),
 dy: z.number().int().describe("Vertical offset in pixels (positive = down)."),
 }),
 handler: async (args) => {
 const { mouse, Point } = await nut();
 const pos = await mouse.getPosition();
 const nx = pos.x + args.dx;
 const ny = pos.y + args.dy;
 await mouse.setPosition(new Point(nx, ny));
 return `Moved cursor by (${args.dx}, ${args.dy}) to (${nx}, ${ny}).`;
 },
};

export const inputCursorPosition: NotiTool = {
 name: "input_cursor_position",
 description: "Return the current mouse cursor position as absolute screen coordinates.",
 schema: z.object({}),
 handler: async () => {
 const { mouse } = await nut();
 const pos = await mouse.getPosition();
 return `Cursor is at (${pos.x}, ${pos.y}).`;
 },
};

export const inputScreenSize: NotiTool = {
 name: "input_screen_size",
 description: "Return the primary screen size in pixels. Use it to plan click/draw coordinates.",
 schema: z.object({}),
 handler: async () => {
 const { screen } = await nut();
 const w = await screen.width();
 const h = await screen.height();
 return `Screen is ${w}x${h} pixels.`;
 },
};

export const inputWait: NotiTool = {
 name: "input_wait",
 description: "Pause for a number of milliseconds. Useful to time UI reactions between input actions.",
 schema: z.object({ ms: z.number().int().min(0).describe("Milliseconds to wait.") }),
 handler: async (args) => {
 await new Promise((r) => setTimeout(r, args.ms));
 return `Waited ${args.ms} ms.`;
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
 const btn = resolveButton(Button, args.button);
 if (args.double) await mouse.doubleClick(btn);
 else await mouse.click(btn);
 return `${args.double ? "Double-clicked" : "Clicked"} ${args.button ?? "left"} button.`;
 },
};

export const inputMouseButton: NotiTool = {
 name: "input_mouse_button",
 description:
 "Press (hold) or release a mouse button without clicking. Use action 'down' to start a hold/drag and 'up' to end it. Pair with input_move between down and up to build any custom drag gesture.",
 schema: z.object({
 action: z.enum(["down", "up"]).describe("'down' to press and hold, 'up' to release."),
 button: z.enum(["left", "right", "middle"]).optional().describe("Which button (default: left)."),
 x: z.number().int().optional().describe("Move here before pressing/releasing."),
 y: z.number().int().optional().describe("Move here before pressing/releasing."),
 }),
 handler: async (args) => {
 const { mouse, Point, Button } = await nut();
 if (args.x != null && args.y != null) await mouse.setPosition(new Point(args.x, args.y));
 const btn = resolveButton(Button, args.button);
 if (args.action === "down") await mouse.pressButton(btn);
 else await mouse.releaseButton(btn);
 return `${args.action === "down" ? "Pressed and holding" : "Released"} ${args.button ?? "left"} button.`;
 },
};

export const inputDrag: NotiTool = {
 name: "input_drag",
 description:
 "Press and hold a mouse button, drag along a smooth path from a start point to an end point, then release. Use for moving windows/files, selecting a region, or dragging sliders.",
 schema: z.object({
 from_x: z.number().int().describe("Start X in pixels."),
 from_y: z.number().int().describe("Start Y in pixels."),
 to_x: z.number().int().describe("End X in pixels."),
 to_y: z.number().int().describe("End Y in pixels."),
 button: z.enum(["left", "right", "middle"]).optional().describe("Which button (default: left)."),
 steps: z.number().int().optional().describe("Interpolation steps for a smooth drag (default: 20)."),
 }),
 handler: async (args) => {
 const { mouse, Point, Button } = await nut();
 const btn = resolveButton(Button, args.button);
 const path = lerpPath(Point, args.from_x, args.from_y, args.to_x, args.to_y, args.steps ?? 20);
 await mouse.setPosition(path[0]);
 await mouse.pressButton(btn);
 try {
 await mouse.move(path);
 } finally {
 await mouse.releaseButton(btn);
 }
 return `Dragged ${args.button ?? "left"} button from (${args.from_x}, ${args.from_y}) to (${args.to_x}, ${args.to_y}).`;
 },
};

export const inputDraw: NotiTool = {
 name: "input_draw",
 description:
 "Draw a freeform stroke: move to the first point, hold a button down, glide through every point in order, then release. Perfect for painting/drawing apps and signatures. Points are absolute screen pixels.",
 schema: z.object({
 points: z
 .array(z.object({ x: z.number().int(), y: z.number().int() }))
 .min(2)
 .describe("Ordered list of {x, y} points describing the stroke."),
 button: z.enum(["left", "right", "middle"]).optional().describe("Which button to hold (default: left)."),
 smooth: z
 .number()
 .int()
 .optional()
 .describe("Interpolation steps between consecutive points for smoother lines (default: 8, 0 = straight segments)."),
 speed: z.number().int().optional().describe("Cursor speed in pixels/sec (default: leave as-is)."),
 }),
 handler: async (args) => {
 const { mouse, Point, Button } = await nut();
 const btn = resolveButton(Button, args.button);
 const prevSpeed = mouse.config.mouseSpeed;
 if (args.speed != null) mouse.config.mouseSpeed = args.speed;
 const path = pathFromWaypoints(Point, args.points, args.smooth ?? 8);
 await mouse.setPosition(path[0]);
 await mouse.pressButton(btn);
 try {
 await mouse.move(path);
 } finally {
 await mouse.releaseButton(btn);
 if (args.speed != null) mouse.config.mouseSpeed = prevSpeed;
 }
 return `Drew a stroke through ${args.points.length} points with the ${args.button ?? "left"} button.`;
 },
};

export const inputDrawShape: NotiTool = {
 name: "input_draw_shape",
 description:
 "Draw a geometric shape by dragging the mouse: 'line', 'rectangle', 'circle', or 'polygon'. Great for quickly sketching in any drawing app. All coordinates are absolute screen pixels.",
 schema: z.object({
 shape: z.enum(["line", "rectangle", "circle", "polygon"]).describe("Shape to draw."),
 x1: z.number().int().optional().describe("Line/rectangle: start X (top-left for rectangle)."),
 y1: z.number().int().optional().describe("Line/rectangle: start Y (top-left for rectangle)."),
 x2: z.number().int().optional().describe("Line/rectangle: end X (bottom-right for rectangle)."),
 y2: z.number().int().optional().describe("Line/rectangle: end Y (bottom-right for rectangle)."),
 cx: z.number().int().optional().describe("Circle: center X."),
 cy: z.number().int().optional().describe("Circle: center Y."),
 radius: z.number().int().optional().describe("Circle: radius in pixels."),
 segments: z.number().int().optional().describe("Circle: number of segments (default: 48)."),
 points: z
 .array(z.object({ x: z.number().int(), y: z.number().int() }))
 .optional()
 .describe("Polygon: ordered vertices; the shape is automatically closed."),
 button: z.enum(["left", "right", "middle"]).optional().describe("Which button to hold (default: left)."),
 speed: z.number().int().optional().describe("Cursor speed in pixels/sec (default: leave as-is)."),
 }),
 handler: async (args) => {
 const { mouse, Point, Button } = await nut();
 const btn = resolveButton(Button, args.button);

 let waypoints: Array<{ x: number; y: number }> = [];
 if (args.shape === "line") {
 if (args.x1 == null || args.y1 == null || args.x2 == null || args.y2 == null)
 throw new Error("line requires x1, y1, x2, y2.");
 waypoints = [
 { x: args.x1, y: args.y1 },
 { x: args.x2, y: args.y2 },
 ];
 } else if (args.shape === "rectangle") {
 if (args.x1 == null || args.y1 == null || args.x2 == null || args.y2 == null)
 throw new Error("rectangle requires x1, y1, x2, y2.");
 waypoints = [
 { x: args.x1, y: args.y1 },
 { x: args.x2, y: args.y1 },
 { x: args.x2, y: args.y2 },
 { x: args.x1, y: args.y2 },
 { x: args.x1, y: args.y1 },
 ];
 } else if (args.shape === "circle") {
 if (args.cx == null || args.cy == null || args.radius == null)
 throw new Error("circle requires cx, cy, radius.");
 const segs = Math.max(8, args.segments ?? 48);
 for (let i = 0; i <= segs; i++) {
 const a = (i / segs) * Math.PI * 2;
 waypoints.push({
 x: Math.round(args.cx + args.radius * Math.cos(a)),
 y: Math.round(args.cy + args.radius * Math.sin(a)),
 });
 }
 } else {
 if (!args.points || args.points.length < 3)
 throw new Error("polygon requires at least 3 points.");
 waypoints = [...args.points, args.points[0]];
 }

 const prevSpeed = mouse.config.mouseSpeed;
 if (args.speed != null) mouse.config.mouseSpeed = args.speed;
 const path = pathFromWaypoints(Point, waypoints, args.shape === "circle" ? 0 : 12);
 await mouse.setPosition(path[0]);
 await mouse.pressButton(btn);
 try {
 await mouse.move(path);
 } finally {
 await mouse.releaseButton(btn);
 if (args.speed != null) mouse.config.mouseSpeed = prevSpeed;
 }
 return `Drew a ${args.shape} with the ${args.button ?? "left"} button.`;
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
 const parts: string[] = args.keys.toLowerCase().split("+").map((p: string) => p.trim()).filter(Boolean);
 const keys = parts.map((p: string) => {
 const resolved =
 map[p] ??
 (p.length === 1
 ? (Key as any)[p.toUpperCase()]
 : (Key as any)[p[0].toUpperCase() + p.slice(1)]);
 if (resolved == null) throw new Error(`Unknown key: \"${p}\"`);
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
