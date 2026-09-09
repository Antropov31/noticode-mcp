import type { AgentExecutor } from "./executor-types.js";
import {
  minecraftDeveloperExecutor,
  minecraftPlayerExecutor,
  creativeExecutor,
  godotExecutor,
  computerExecutor,
} from "./modules/index.js";

const executors: AgentExecutor[] = [];

export function registerExecutor(executor: AgentExecutor) {
  executors.push(executor);
}

for (const executor of [
  minecraftDeveloperExecutor,
  minecraftPlayerExecutor,
  creativeExecutor,
  godotExecutor,
  computerExecutor,
]) {
  registerExecutor(executor);
}

export function findExecutor(task: string) {
  return executors.find((executor) => executor.canHandle(task));
}

export function listExecutors() {
  return executors.map((executor) => executor.id);
}
