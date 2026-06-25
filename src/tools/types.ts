import type { z } from "zod";

export interface ToolContext {
  workspace: string;
  allowShell: boolean;
  allowWrite: boolean;
  maxOutputChars: number;
}

export interface NotiTool {
  name: string;
  description: string;
  schema: z.ZodObject<any>;
  handler: (args: any, ctx: ToolContext) => Promise<string>;
}
