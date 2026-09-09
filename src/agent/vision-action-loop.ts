import { createHash } from "node:crypto";
import { assertNotEmergencyStopped } from "../emergency-stop.js";
import { grabScreen } from "../tools/vision.js";
import { desktopController } from "../skills/computer/controller/desktop-controller.js";
import type { InputAction } from "../skills/computer/controller/controller-types.js";

export type VisionActionResult = {
  action: InputAction;
  before: string;
  after: string;
  changed: boolean;
  verified: boolean;
  verification: "screen_changed" | "input_dispatched" | "no_visible_change";
};

function digest(image: Buffer): string {
  return createHash("sha256").update(image).digest("hex");
}

/** Execute one desktop action with bounded before/after visual verification. */
export async function executeWithVisionVerification(
  action: InputAction,
  waitMs = 250,
  display?: number,
): Promise<VisionActionResult> {
  assertNotEmergencyStopped();
  const before = digest(await grabScreen(display));
  await desktopController.execute(action);
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 5000)));
  assertNotEmergencyStopped();
  const after = digest(await grabScreen(display));
  const changed = before !== after;
  const inputOnly = action.type === "mouse_move" || action.type === "mouse_click";
  const verification = changed ? "screen_changed" : inputOnly ? "input_dispatched" : "no_visible_change";
  return { action, before, after, changed, verified: changed || inputOnly, verification };
}
