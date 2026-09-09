import type { AgentExecutor, ExecutorContext } from "../executor-types.js";

export const godotExecutor: AgentExecutor = {
  id: "godot",
  canHandle(task: string) {
    const text = task.toLowerCase();
    return ["godot", "gdscript", ".tscn", "сцена godot"].some((x) => text.includes(x));
  },
  async execute(context: ExecutorContext) {
    return {
      status: "planned",
      task: context.task,
      actions: [
        "inspect project",
        "edit scenes or scripts",
        "run checks"
      ]
    };
  }
};
