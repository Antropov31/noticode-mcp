import { SKILLS } from "../skills/registry.js";

export function findSkills(task: string) {
  const text = task.toLowerCase();
  return SKILLS.filter((skill) => {
    if (text.includes("minecraft") && skill.id === "minecraft") return true;
    if ((text.includes("mine-imator") || text.includes("mineimator") || text.includes("blockdisplay") || text.includes("block display") || text.includes("blockbench") || text.includes("3d")) && skill.id === "minecraft-creative") return true;
    if ((text.includes("код") || text.includes("plugin") || text.includes("java")) && skill.id === "coding") return true;
    if ((text.includes("игр") || text.includes("играть")) && skill.id === "game-agent") return true;
    if ((text.includes("открой") || text.includes("запусти") || text.includes("браузер") || text.includes("окно") || text.includes("компьютер") || text.includes("мышь") || text.includes("клавиатура")) && skill.id === "computer-agent") return true;
    return false;
  });
}
