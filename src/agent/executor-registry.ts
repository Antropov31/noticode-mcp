export type Executor = {
  id: string;
  execute: (task: string) => Promise<unknown>;
};

const executors = new Map<string, Executor>();

export function registerExecutor(executor: Executor) {
  executors.set(executor.id, executor);
}

export function getExecutor(id: string) {
  return executors.get(id);
}
