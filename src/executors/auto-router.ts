import { findExecutor } from "./registry.js";
import { splitTask } from "../agent/task-coordinator.js";

export function routeTask(task: string) {
  const executor = findExecutor(task);

  return {
    task,
    executor,
  };
}

export function routeComplexTask(task: string) {
  return splitTask(task);
}

export function shouldSwitch(previous: string | undefined, next: string | undefined) {
  return Boolean(previous && next && previous !== next);
}
