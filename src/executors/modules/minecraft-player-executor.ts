import type { AgentExecutor, ExecutorContext } from "../executor-types.js";

export const minecraftPlayerExecutor: AgentExecutor = {
  id: "minecraft-player",
  canHandle(task: string) {
    const text = task.toLowerCase();
    return ["играть", "игра", "play minecraft", "in-game"].some((x) => text.includes(x));
  },
  async execute(context: ExecutorContext) {
    return {
      status: "planned",
      task: context.task,
      actions: [
        "observe world",
        "create plan",
        "perform player actions",
        "verify result"
      ]
    };
  }
};
