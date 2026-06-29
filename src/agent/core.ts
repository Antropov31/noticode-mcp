import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { tools } from "../tools/index.js";
import type { ToolContext } from "../tools/types.js";
import type { NotiConfig } from "../config.js";

export const SYSTEM = `You are NotiCode, a blue, no-nonsense AI coding agent running directly on the user's machine.
You can read and write files, run shell commands, inspect the system, and message the user on Telegram through your tools.
Be decisive: when the user asks for something, use your tools to actually do it instead of explaining how.
Keep replies short. Operate inside the configured workspace unless told otherwise.`;

/** Build a ToolContext from config so every entry point wires tools the same way. */
export function buildContext(config: NotiConfig): ToolContext {
  return {
    workspace: config.workspace,
    allowShell: config.allowShell,
    allowWrite: config.allowWrite,
    maxOutputChars: config.maxOutputChars,
    telegramToken: config.telegramToken,
    telegramChatId: config.telegramChatId,
  };
}

/** Convert the tool registry into Anthropic tool definitions. */
export function buildAnthropicTools(): any[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: zodToJsonSchema(t.schema, { target: "openApi3" }) as any,
  }));
}

export interface TurnHooks {
  /** Called for each chunk of assistant text. May be async. */
  onText?: (text: string) => void | Promise<void>;
  /** Called when the agent invokes a tool. */
  onTool?: (name: string, input: unknown) => void | Promise<void>;
}

/**
 * Run a single agent turn: loop through model calls and tool execution until
 * the model stops requesting tools. `messages` is mutated in place so callers
 * can keep conversation history across turns.
 */
export async function runTurn(
  client: Anthropic,
  config: NotiConfig,
  ctx: ToolContext,
  anthropicTools: any[],
  messages: Anthropic.MessageParam[],
  hooks: TurnHooks = {},
): Promise<void> {
  while (true) {
    const res = await client.messages.create({
      model: config.model,
      max_tokens: 4096,
      system: SYSTEM,
      tools: anthropicTools,
      messages,
    });

    messages.push({ role: "assistant", content: res.content });

    for (const block of res.content) {
      if (block.type === "text" && block.text.trim()) {
        await hooks.onText?.(block.text.trim());
      }
    }

    const toolUses = res.content.filter((c: any) => c.type === "tool_use") as any[];
    if (toolUses.length === 0) return;

    const results: any[] = [];
    for (const tu of toolUses) {
      const tool = tools.find((t) => t.name === tu.name);
      await hooks.onTool?.(tu.name, tu.input);
      let text: string;
      try {
        text = tool ? await tool.handler(tu.input, ctx) : `Unknown tool ${tu.name}`;
      } catch (e: any) {
        text = `Error: ${e?.message ?? e}`;
      }
      results.push({ type: "tool_result", tool_use_id: tu.id, content: text });
    }

    messages.push({ role: "user", content: results as any });
  }
}
