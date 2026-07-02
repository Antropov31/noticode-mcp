import type { z } from "zod";
import type { NotiConfig } from "../config.js";

export interface ToolContext {
  workspace: string;
  allowShell: boolean;
  allowWrite: boolean;
  maxOutputChars: number;
  homeAssistantUrl?: string;
  homeAssistantToken?: string;
}

/** An image a tool wants to hand back to the model, as base64-encoded bytes. */
export interface ToolImage {
  /** Base64-encoded image data (no "data:" prefix). */
  data: string;
  /** MIME type, e.g. "image/png" (default) or "image/jpeg". */
  mimeType?: string;
}

/**
 * What a tool handler may return:
 * - a plain string (text-only result, the common case), or
 * - a rich result with optional text and/or images, so the agent can *see*
 *   what happened (e.g. a live screenshot).
 */
export type ToolResult = string | { text?: string; images?: ToolImage[] };

export interface NotiTool {
  name: string;
  description: string;
  schema: z.ZodObject<any>;
  handler: (args: any, ctx: ToolContext) => Promise<ToolResult>;
}

/** Build a ToolContext from config so every entry point wires tools identically. */
export function buildToolContext(config: NotiConfig): ToolContext {
  return {
    workspace: config.workspace,
    allowShell: config.allowShell,
    allowWrite: config.allowWrite,
    maxOutputChars: config.maxOutputChars,
    homeAssistantUrl: config.homeAssistantUrl,
    homeAssistantToken: config.homeAssistantToken,
  };
}
