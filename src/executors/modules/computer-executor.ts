import type { AgentExecutor, ExecutorContext } from "../executor-types.js";
import { findController } from "../../skills/computer/controller/registry.js";
import type { InputAction } from "../../skills/computer/controller/controller-types.js";

function actionFromTask(task: string): InputAction | null {
  const text = task.trim();
  const move = text.match(/(?:move|перемест\w*|двиг\w*)[^0-9]*(\d+)\s*[, ]\s*(\d+)/i);
  if (move) return { type: "mouse_move", x: Number(move[1]), y: Number(move[2]) };
  if (/(?:right|прав\w*)[^a-zа-я]*(?:click|клик)/i.test(text)) return { type: "mouse_click", button: "right" };
  if (/(?:click|клик|нажм\w*)/i.test(text)) return { type: "mouse_click", button: "left" };
  const type = text.match(/(?:type|напечат\w*|введ\w*)\s*[:\-]?\s*["«](.*?)["»]$/i);
  if (type) return { type: "type_text", text: type[1] };
  const key = text.match(/(?:press|нажм\w*)\s+(?:key\s+)?([a-z0-9+_-]+)$/i);
  if (key) return { type: "keyboard_press", key: key[1] };
  return null;
}

export const computerExecutor: AgentExecutor = {
  id: "computer-agent",
  canHandle(task: string) {
    const text = task.toLowerCase();
    return ["открой", "запусти", "браузер", "окно", "компьютер", "мышь", "клавиатура", "click", "type", "press", "mouse"].some((x) => text.includes(x));
  },
  async execute(context: ExecutorContext) {
    const action = actionFromTask(context.task);
    if (!action) {
      return { status: "needs_tool_call", task: context.task, actions: ["observe screen", "choose a precise input/window tool", "verify result"] };
    }
    const controller = findController(action);
    if (!controller) throw new Error(`No controller can execute ${action.type}.`);
    await controller.execute(action);
    return { status: "completed", task: context.task, controller: controller.id, action };
  },
};
