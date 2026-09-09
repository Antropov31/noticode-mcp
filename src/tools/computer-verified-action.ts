import { z } from "zod";
import type { NotiTool } from "./types.js";
import { executeWithVisionVerification } from "../agent/vision-action-loop.js";

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("mouse_move"), x: z.number().int(), y: z.number().int() }),
  z.object({ type: z.literal("mouse_click"), button: z.enum(["left", "right"]), x: z.number().int().optional(), y: z.number().int().optional() }),
  z.object({ type: z.literal("keyboard_press"), key: z.string().min(1) }),
  z.object({ type: z.literal("type_text"), text: z.string() }),
]);

export const computerVerifiedAction: NotiTool = {
  name: "computer_action_verify",
  description: "Execute one mouse/keyboard action, capture the screen before and after, and report whether the visible screen changed. Use for cautious desktop workflows and game control.",
  schema: z.object({
    action: actionSchema,
    wait_ms: z.number().int().min(0).max(5000).optional().describe("Delay before verification, default 250ms."),
    display: z.number().int().optional(),
  }),
  handler: async (args) => {
    const result = await executeWithVisionVerification(args.action, args.wait_ms ?? 250, args.display);
    return JSON.stringify(result);
  },
};
