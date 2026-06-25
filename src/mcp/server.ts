import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { tools } from "../tools/index.js";
import type { ToolContext } from "../tools/types.js";
import type { NotiConfig } from "../config.js";

/**
 * Build a fully-wired McpServer (all tools registered) without binding it to a
 * transport. Reused by both the stdio and HTTP entry points.
 */
export function buildMcpServer(config: NotiConfig): McpServer {
  const ctx: ToolContext = {
    workspace: config.workspace,
    allowShell: config.allowShell,
    allowWrite: config.allowWrite,
    maxOutputChars: config.maxOutputChars,
  };

  const server = new McpServer({
    name: "noticode",
    version: "0.1.0",
  });

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.schema.shape,
      },
      async (args: any) => {
        try {
          const text = await tool.handler(args, ctx);
          return { content: [{ type: "text" as const, text }] };
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
  // Log to stderr: stdout is reserved for the MCP protocol stream.
  process.stderr.write(`NotiCode MCP server running on stdio \u00b7 workspace: ${config.workspace}\n`);
}
