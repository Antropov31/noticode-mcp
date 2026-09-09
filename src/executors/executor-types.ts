export type ExecutorContext = {
  task: string;
  mode?: string;
};

export interface AgentExecutor {
  id: string;
  canHandle(task: string): boolean;
  execute(context: ExecutorContext): Promise<unknown>;
}
