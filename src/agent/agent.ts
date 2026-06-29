import readline from "node:readline";
import Anthropic from "@anthropic-ai/sdk";
import type { NotiConfig } from "../config.js";
import { blue, sky, muted, banner } from "../theme.js";
import { buildAnthropicTools, buildContext, runTurn } from "./core.js";

export async function startChat(config: NotiConfig): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Set ANTHROPIC_API_KEY to use chat mode.");
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  const ctx = buildContext(config);
  const anthropicTools = buildAnthropicTools();

  console.log(banner);
  console.log(muted(`workspace: ${config.workspace} \u00b7 model: ${config.model}`));
  console.log(muted("type a request, or /exit to quit\n"));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const messages: Anthropic.MessageParam[] = [];

  const ask = (): void => {
    rl.question(blue("you \u203a "), async (line) => {
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
        await runTurn(client, config, ctx, anthropicTools, messages, {
          onText: (t) => console.log(sky("noti \u203a ") + t),
          onTool: (n, i) => console.log(muted(`  \u2699 ${n} ${JSON.stringify(i)}`)),
        });
      } catch (e: any) {
        console.error(muted(`\u26a0 ${e?.message ?? e}`));
      }
      ask();
    });
  };

  ask();
}
