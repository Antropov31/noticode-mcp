import type { ComputerController } from "./controller-types.js";
import { desktopController } from "./desktop-controller.js";

const controllers: ComputerController[] = [desktopController];

export function registerController(controller: ComputerController) {
  controllers.push(controller);
}

export function findController(action: Parameters<ComputerController["canExecute"]>[0]) {
  return controllers.find((controller) => controller.canExecute(action));
}

export function listControllers() {
  return controllers.map((controller) => controller.id);
}
