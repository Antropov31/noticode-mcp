import readline from "node:readline";
import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { tools } from "../tools/index.js";
import { buildToolContext } from "../tools/types.js";
import type { ToolResult } from "../tools/types.js";
import type { NotiConfig } from "../config.js";
import { assertNotEmergencyStopped, ensureEmergencyStop, isEmergencyStopped } from "../emergency-stop.js";
import { blue, sky, muted, banner } from "../theme.js";

const SYSTEM = `You are NotiCode, a blue, no-nonsense AI coding agent running directly on the user's machine.
You have hands and eyes: read/write/edit files, run shell commands, inspect the system, watch the filesystem,
take screenshots (single or a timed series) and webcam photos, control the mouse and keyboard, read/write the
clipboard, record the mic and play audio, drive a headless browser, show desktop notifications, and control
Home Assistant devices.
Be decisive: when the user asks for something, use your tools to actually do it instead of explaining how.
If a tool reports EMERGENCY STOP ACTIVE, immediately end the current request and do not call another tool.
Keep replies short. Operate inside the configured workspace unless told otherwise.`;

function toolResultContent(result: ToolResult): any {
 if (typeof result === "string") return result;
 const content: any[] = [];
 if (result.text) content.push({ type: "text", text: result.text });
 for (const image of result.images ?? []) {
 content.push({
 type: "image",
 source: {
 type: "base64",
 media_type: image.mimeType ?? "image/png",
 data: image.data,
 },
 });
 }
 return content.length ? content : "(no output)";
}

export async function startChat(config: NotiConfig): Promise<void> {
 await ensureEmergencyStop();
 const apiKey = process.env.ANTHROPIC_API_KEY;
 if (!apiKey) {
 console.error("Set ANTHROPIC_API_KEY to use chat mode.");
 process.exit(1);
 }

 const client = new Anthropic({ apiKey });
 const ctx = buildToolContext(config);
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
 if (input === "/exit" || input === "/quit") { rl.close(); return; }
 if (!input) { ask(); return; }
 messages.push({ role: "user", content: input });
 try { await runTurn(client, config, ctx, anthropicTools, messages); }
 catch (e: any) { console.error(muted(`⚠ ${e?.message ?? e}`)); }
 ask();
 });
 };
 ask();
}

async function runTurn(
 client: Anthropic,
 config: NotiConfig,
 ctx: ReturnType<typeof buildToolContext>,
 anthropicTools: any[],
 messages: Anthropic.MessageParam[],
): Promise<void> {
 while (true) {
 if (isEmergencyStopped()) {
 console.log(muted("noti › EMERGENCY STOP ACTIVE. Current request cancelled."));
 return;
 }
 const res = await client.messages.create({
 model: config.model,
 max_tokens: 4096,
 system: SYSTEM,
 tools: anthropicTools,
 messages,
 });
 if (isEmergencyStopped()) {
 console.log(muted("noti › EMERGENCY STOP ACTIVE. Current request cancelled."));
 return;
 }
 messages.push({ role: "assistant", content: res.content });
 for (const block of res.content) {
 if (block.type === "text" && block.text.trim()) console.log(sky("noti › ") + block.text.trim());
 }
 const toolUses = res.content.filter((c: any) => c.type === "tool_use") as any[];
 if (toolUses.length === 0) return;
 const results: any[] = [];
 for (const tu of toolUses) {
 const tool = tools.find((t) => t.name === tu.name);
 console.log(muted(` ⚙ ${tu.name} ${JSON.stringify(tu.input)}`));
 let content: any;
 try {
 assertNotEmergencyStopped();
 const result: ToolResult = tool ? await tool.handler(tu.input, ctx) : `Unknown tool ${tu.name}`;
 assertNotEmergencyStopped();
 content = toolResultContent(result);
 } catch (e: any) {
 content = `Error: ${e?.message ?? e}`;
 }
 results.push({ type: "tool_result", tool_use_id: tu.id, content });
 if (isEmergencyStopped()) break;
 }
 messages.push({ role: "user", content: results as any });
 if (isEmergencyStopped()) return;
 }
}
