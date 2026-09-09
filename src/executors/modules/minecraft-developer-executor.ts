import type { AgentExecutor, ExecutorContext } from "../executor-types.js";

export const minecraftDeveloperExecutor: AgentExecutor = {
  id: "minecraft-developer",
  canHandle(task: string) {
    const text = task.toLowerCase();
    return ["minecraft", "плагин", "plugin", "spigot", "paper", "bukkit"].some((x) => text.includes(x));
  },
  async execute(context: ExecutorContext) {
    return {
      status: "planned",
      task: context.task,
      actions: [
        "analyze plugin structure",
        "edit source code",
        "build artifact",
        "prepare release"
      ]
    };
  }
};
