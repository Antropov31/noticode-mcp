import { findSkills } from "./skill-router.js";
import { detectMode } from "./mode-manager.js";
import { findExecutor } from "../executors/registry.js";
import { listConnectors } from "../connectors/registry.js";

export function createCapabilityPlan(task: string) {
  const skills = findSkills(task);
  const mode = detectMode(task);
  const executor = findExecutor(task);
  const text = task.toLowerCase();
  const connectors = listConnectors()
    .filter((connector) => {
      const aliases: Record<string, string[]> = {
        ide: ["код", "code", "ide", "плагин"],
        browser: ["браузер", "browser", "сайт", "web"],
        minecraft: ["minecraft", "майнкрафт", "плагин", "сервер"],
        "mine-imator": ["mine-imator", "mineimator"],
        "block-display-editor": ["blockdisplay", "block display"],
        blockbench: ["blockbench", "блокбенч"],
        godot: ["godot"],
      };
      return (aliases[connector.id] ?? []).some((alias) => text.includes(alias));
    })
    .map((connector) => connector.id);

  return {
    task,
    mode,
    skills: skills.map((s) => s.id),
    executor: executor?.id ?? null,
    connectors,
    pipeline: ["observe", "plan", "act", "verify", "reflect"],
  };
}
