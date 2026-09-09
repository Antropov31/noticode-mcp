export type AgentStage =
  | "observe"
  | "plan"
  | "execute"
  | "verify"
  | "reflect";

export interface AgentTask {
  id: string;
  goal: string;
  stage: AgentStage;
  skills: string[];
}

export function createPipeline(goal: string): AgentTask {
  return {
    id: crypto.randomUUID(),
    goal,
    stage: "observe",
    skills: [],
  };
}
