export type MinecraftPlayerTask =
  | "build"
  | "survival"
  | "farm"
  | "explore"
  | "combat"
  | "schematic";

export function planMinecraftTask(task: MinecraftPlayerTask) {
  const plans = {
    build: ["analyze target", "collect blocks", "construct", "inspect"],
    survival: ["gather resources", "craft", "upgrade gear", "continue"],
    farm: ["choose design", "prepare area", "build", "verify"],
    explore: ["scan area", "navigate", "collect", "return"],
    combat: ["prepare", "observe opponent", "fight", "recover"],
    schematic: ["read blueprint", "map blocks", "build step by step"],
  };

  return plans[task];
}
