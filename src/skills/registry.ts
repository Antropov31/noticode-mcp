import type { AgentSkill } from "./skill-types.js";
import { computerSkill } from "./computer/skill.js";

export const SKILLS: AgentSkill[] = [
  computerSkill,
  {
    id: "coding",
    category: "coding",
    description: "Software development and debugging",
    goals: ["understand code", "edit", "build", "verify"],
    tools: ["filesystem", "shell", "process"],
    checks: ["compile", "tests", "logs"],
  },
  {
    id: "minecraft",
    category: "minecraft",
    description: "Minecraft server and plugin workflow",
    goals: ["analyze errors", "build plugins", "prepare releases"],
    tools: ["filesystem", "shell", "browser"],
    checks: ["build", "startup", "plugin compatibility"],
  },
  {
    id: "minecraft-creative",
    category: "creative",
    description: "Minecraft creative pipeline: Mine-imator, BlockDisplayEditor, Blockbench and asset creation",
    goals: ["create models", "textures", "animations", "Minecraft scenes"],
    tools: ["desktop", "vision", "filesystem"],
    checks: ["export", "preview", "render"],
  },
  {
    id: "game-agent",
    category: "game",
    description: "Game interaction and testing",
    goals: ["observe", "control", "complete tasks"],
    tools: ["vision", "input", "screen"],
    checks: ["state", "result"],
  },
];
