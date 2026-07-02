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

export interface NotiTool {
  name: string;
  description: string;
  schema: z.ZodObject<any>;
  handler: (args: any, ctx: ToolContext) => Promise<string>;
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
