import { importOptional } from "./tools/optional.js";

const MAIN_0 = 0x000b;
const MAIN_9 = 0x000a;
const MAIN_7 = 0x0008;
const MAIN_8 = 0x0009;
const NUMPAD_0 = 0x0060;
const NUMPAD_9 = 0x0069;
const NUMPAD_7 = 0x0067;
const NUMPAD_8 = 0x0068;

const pressed = new Set<number>();
let started = false;
let stopped = false;
let stopChordHeld = false;
let resumeChordHeld = false;
let reason = "";

function hasAny(...codes: number[]): boolean {
 return codes.some((code) => pressed.has(code));
}

async function releaseInput(): Promise<void> {
 try {
 const { mouse, keyboard, Button, Key } = await importOptional(
 "@nut-tree-fork/nut-js",
 "Run `npm install` to enable emergency input release.",
 );
 for (const button of [Button.LEFT, Button.RIGHT, Button.MIDDLE]) {
 try { await mouse.releaseButton(button); } catch { /* button was not held */ }
 }
 for (const key of [Key.LeftControl, Key.RightControl, Key.LeftAlt, Key.RightAlt, Key.LeftShift, Key.RightShift, Key.LeftSuper, Key.RightSuper]) {
 if (key == null) continue;
 try { await keyboard.releaseKey(key); } catch { /* key was not held */ }
 }
 } catch {
 // The stop latch still blocks every later tool call even if nut-js is unavailable.
 }
}

export function triggerEmergencyStop(source = "global hotkey 0+9"): void {
 stopped = true;
 reason = source;
 process.stderr.write("\n\x07[NOTICODE] EMERGENCY STOP: all agent tools are blocked. Press 7+8 to resume.\n");
 void releaseInput();
}

export function resumeEmergencyStop(source = "global hotkey 7+8"): void {
 stopped = false;
 reason = "";
 process.stderr.write(`\n[NOTICODE] Emergency stop cleared by ${source}.\n`);
}

export function isEmergencyStopped(): boolean {
 return stopped;
}

export function assertNotEmergencyStopped(): void {
 if (stopped) {
 throw new Error(`EMERGENCY STOP ACTIVE${reason ? ` (${reason})` : ""}. Do not continue this request. Wait until the user presses 7+8 or restarts NotiCode.`);
 }
}

export async function ensureEmergencyStop(): Promise<void> {
 if (started) return;
 started = true;
 try {
 const { uIOhook } = await importOptional(
 "uiohook-napi",
 "Run `npm install` to enable the global emergency hotkey.",
 );
 uIOhook.on("keydown", (event: any) => {
 pressed.add(event.keycode);
 const stopDown = hasAny(MAIN_0, NUMPAD_0) && hasAny(MAIN_9, NUMPAD_9);
 if (stopDown && !stopChordHeld) {
 stopChordHeld = true;
 triggerEmergencyStop();
 }
 const resumeDown = hasAny(MAIN_7, NUMPAD_7) && hasAny(MAIN_8, NUMPAD_8);
 if (resumeDown && !resumeChordHeld) {
 resumeChordHeld = true;
 resumeEmergencyStop();
 }
 });
 uIOhook.on("keyup", (event: any) => {
 pressed.delete(event.keycode);
 if (!hasAny(MAIN_0, NUMPAD_0) || !hasAny(MAIN_9, NUMPAD_9)) stopChordHeld = false;
 if (!hasAny(MAIN_7, NUMPAD_7) || !hasAny(MAIN_8, NUMPAD_8)) resumeChordHeld = false;
 });
 uIOhook.start();
 process.stderr.write("[NOTICODE] Emergency hotkeys active: 0+9 STOP, 7+8 RESUME.\n");
 } catch (error: any) {
 started = false;
 process.stderr.write(`[NOTICODE] Emergency hotkey unavailable: ${error?.message ?? error}\n`);
 }
}
