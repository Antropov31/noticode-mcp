import type { AgentConnector } from "./connector-types.js";
import { BASE_CONNECTORS } from "./modules/base-connectors.js";

const connectors = new Map<string, AgentConnector>();

for (const connector of BASE_CONNECTORS) registerConnector(connector);

export function registerConnector(connector: AgentConnector) {
  connectors.set(connector.id, connector);
}

export function getConnector(id: string) {
  return connectors.get(id);
}

export function listConnectors() {
  return [...connectors.values()];
}
