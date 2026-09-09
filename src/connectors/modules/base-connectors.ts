import type { AgentConnector } from "../connector-types.js";


export const BASE_CONNECTORS: AgentConnector[] = [
  "ide", "browser", "minecraft", "mine-imator", "block-display-editor", "blockbench", "godot",
].map((id) => ({
  id,
  name: id,
  capabilities: id === "minecraft" ? ["observe", "input", "game-loop"] : ["observe", "focus", "input"],
  async available() {
    // The connector is usable only when a desktop backend is present; app discovery happens at runtime.
    return true;
  },
}));
