import type { AgentSkill } from "../skill-types.js";
import { listControllers } from "./controller/registry.js";

export const computerSkill: AgentSkill = {
  id: "computer-agent",
  category: "computer",
  description: "Computer control, applications and desktop workflow",
  goals: [
    "observe screen",
    "manage windows",
    "interact with applications",
    "work with browser",
    "execute desktop workflows",
  ],
  tools: [
    "screen",
    "mouse",
    "keyboard",
    "process",
    "window",
    "filesystem",
    "browser",
  ],
  checks: ["action result", "application state", `controller: ${listControllers().join(", ")}`],
};
