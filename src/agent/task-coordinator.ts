export type TaskPart = {
  description: string;
  mode: string;
  executor?: string;
};

export function splitTask(task: string): TaskPart[] {
  const text = task.toLowerCase();
  const parts: TaskPart[] = [];

  if (text.includes("код") || text.includes("плагин") || text.includes("java")) {
    parts.push({ description: "coding task", mode: "developer", executor: "minecraft-developer" });
  }

  if (text.includes("майн") || text.includes("minecraft") || text.includes("построй")) {
    parts.push({ description: "minecraft task", mode: "gamer", executor: "minecraft-player" });
  }

  if (text.includes("модель") || text.includes("анимац") || text.includes("blockbench") || text.includes("mine-imator")) {
    parts.push({ description: "creative task", mode: "artist", executor: "creative" });
  }

  if (parts.length === 0) {
    parts.push({ description: task, mode: "developer" });
  }

  return parts;
}
