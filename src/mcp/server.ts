import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { tools } from "../tools/index.js";
import { buildToolContext } from "../tools/types.js";
import type { ToolResult } from "../tools/types.js";
import type { NotiConfig } from "../config.js";
import { assertNotEmergencyStopped, ensureEmergencyStop } from "../emergency-stop.js";

/** Normalize a tool's return value into MCP content blocks (text + images). */
function toContent(result: ToolResult) {
 const content: any[] = [];
 if (typeof result === "string") {
 content.push({ type: "text" as const, text: result });
 return content;
 }
 if (result.text) content.push({ type: "text" as const, text: result.text });
 for (const img of result.images ?? []) {
 content.push({
 type: "image" as const,
 data: img.data,
 mimeType: img.mimeType ?? "image/png",
 });
 }
 if (content.length === 0) content.push({ type: "text" as const, text: "(no output)" });
 return content;
}

/** Build an McpServer with every NotiCode tool registered. Shared by stdio + http. */
export function buildMcpServer(config: NotiConfig): McpServer {
 void ensureEmergencyStop();
 const ctx = buildToolContext(config);
 const server = new McpServer({ name: "noticode", version: "0.1.0" });

 for (const tool of tools) {
 server.registerTool(
 tool.name,
 {
 description: tool.description,
 inputSchema: tool.schema.shape,
 },
 async (args: any) => {
 try {
 assertNotEmergencyStopped();
 const result = await tool.handler(args, ctx);
 assertNotEmergencyStopped();
 return { content: toContent(result) };
 } catch (e: any) {
 return {
 content: [{ type: "text" as const, text: `Error: ${e?.message ?? e}` }],
 isError: true,
 };
 }
 },
 );
 }

 return server;
}

export async function startMcpServer(config: NotiConfig): Promise<void> {
 const server = buildMcpServer(config);
 const transport = new StdioServerTransport();
 await server.connect(transport);
 process.stderr.write(`NotiCode MCP server running on stdio · workspace: ${config.workspace}\n`);
}
