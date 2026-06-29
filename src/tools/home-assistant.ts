import { z } from "zod";
import type { NotiTool, ToolContext } from "./types.js";

function requireHA(ctx: ToolContext): { url: string; token: string } {
  if (!ctx.homeAssistantUrl || !ctx.homeAssistantToken) {
    throw new Error(
      "Home Assistant is not configured. Set HOME_ASSISTANT_URL and HOME_ASSISTANT_TOKEN.",
    );
  }
  return { url: ctx.homeAssistantUrl.replace(/\/$/, ""), token: ctx.homeAssistantToken };
}

async function ha(ctx: ToolContext, apiPath: string, init: RequestInit = {}): Promise<any> {
  const { url, token } = requireHA(ctx);
  const res = await fetch(`${url}/api/${apiPath}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Home Assistant error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export const haStates: NotiTool = {
  name: "ha_states",
  description:
    "List Home Assistant entities and their current state. Optionally filter by an entity_id substring (e.g. 'light.' or 'climate').",
  schema: z.object({
    filter: z.string().optional().describe("Substring to match against entity_id."),
  }),
  handler: async (args, ctx) => {
    const states = (await ha(ctx, "states")) as any[];
    const list = states
      .filter((s) => !args.filter || s.entity_id.includes(args.filter))
      .map((s) => {
        const name = s.attributes?.friendly_name;
        return `${s.entity_id} = ${s.state}${name ? `  (${name})` : ""}`;
      });
    return list.slice(0, 400).join("\n") || "(no matching entities)";
  },
};

export const haCallService: NotiTool = {
  name: "ha_call_service",
  description:
    "Call a Home Assistant service to control a device or scene. Example: domain 'light', service 'turn_on', entity_id 'light.kitchen'. Use ha_states first to discover entity_ids.",
  schema: z.object({
    domain: z.string().describe("Service domain, e.g. light, switch, climate, scene, media_player."),
    service: z.string().describe("Service name, e.g. turn_on, turn_off, toggle, set_temperature."),
    entity_id: z
      .string()
      .optional()
      .describe("Target entity_id, or a comma-separated list of entity_ids."),
    data: z
      .record(z.any())
      .optional()
      .describe("Extra service data, e.g. { brightness: 128 } or { temperature: 21 }."),
  }),
  handler: async (args, ctx) => {
    const body: Record<string, unknown> = { ...(args.data ?? {}) };
    if (args.entity_id) {
      body.entity_id = args.entity_id.includes(",")
        ? args.entity_id.split(",").map((s) => s.trim())
        : args.entity_id;
    }
    const res = (await ha(ctx, `services/${args.domain}/${args.service}`, {
      method: "POST",
      body: JSON.stringify(body),
    })) as any[];
    const changed = Array.isArray(res) ? `${res.length} entit${res.length === 1 ? "y" : "ies"} changed.` : "Done.";
    return `Called ${args.domain}.${args.service}${args.entity_id ? ` on ${args.entity_id}` : ""}. ${changed}`;
  },
};
