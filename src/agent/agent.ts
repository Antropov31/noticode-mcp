import readline from "node:readline";
import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { tools } from "../tools/index.js";
import type { ToolContext } from "../tools/types.js";
import type { NotiConfig } from "../config.js";
import { blue, sky, muted, banner } from "../theme.js";

const SYSTEM = `You are NotiCode, a blue, no-nonsense AI coding agent running directly on the user's machine.
You can read and write files, run shell commands, and inspect the system through your tools.
Be decisive: when the user asks for something, use your tools to actually do it instead of explaining how.
Keep replies short. Operate inside the configured workspace unless told otherwise.`;

export async function startChat(config: NotiConfig): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Set ANTHROPIC_API_KEY to use chat mode.");
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  const ctx: ToolContext = {
    workspace: config.workspace,
    allowShell: config.allowShell,
    allowWrite: config.allowWrite,
    maxOutputChars: config.maxOutputChars,
  };

  const anthropicTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: zodToJsonSchema(t.schema, { target: "openApi3" }) as any,
  }));

  console.log(banner);
  console.log(muted(`workspace: ${config.workspace} · model: ${config.model}`));
  console.log(muted("type a request, or /exit to quit\n"));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const messages: Anthropic.MessageParam[] = [];

  const ask = (): void => {
    rl.question(blue("you › "), async (line) => {
      const input = line.trim();
      if (input === "/exit" || input === "/quit") {
        rl.close();
        return;
      }
      if (!input) {
        ask();
        return;
      }
      messages.push({ role: "user", content: input });
      try {
        await runTurn(client, config, ctx, anthropicTools, messages);
      } catch (e: any) {
        console.error(muted(`⚠ ${e?.message ?? e}`));
      }
      ask();
    });
  };

  ask();
}

async function runTurn(
  client: Anthropic,
  config: NotiConfig,
  ctx: ToolContext,
  anthropicTools: any[],
  messages: Anthropic.MessageParam[],
): Promise<void> {
  // Tool-use loop: keep going until the model stops asking for tools.
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
        console.log(sky("noti › ") + block.text.trim());
      }
    }

    const toolUses = res.content.filter((c: any) => c.type === "tool_use") as any[];
    if (toolUses.length === 0) return;

    const results: any[] = [];
    for (const tu of toolUses) {
      const tool = tools.find((t) => t.name === tu.name);
      console.log(muted(`  ⚙ ${tu.name} ${JSON.stringify(tu.input)}`));
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
