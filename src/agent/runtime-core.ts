export type AgentPhase =
  | "observe"
  | "plan"
  | "execute"
  | "verify"
  | "reflect";

export type RuntimeState = {
  phase: AgentPhase;
  goal: string;
  startedAt: string;
  steps: string[];
  currentStep: number;
};

export function createRuntime(goal: string): RuntimeState {
  return {
    phase: "observe",
    goal,
    startedAt: new Date().toISOString(),
    steps: [],
    currentStep: 0,
  };
}

export function nextPhase(state: RuntimeState, phase: AgentPhase): RuntimeState {
  return { ...state, phase };
}

export function addStep(state: RuntimeState, step: string): RuntimeState {
  return {
    ...state,
    steps: [...state.steps, step],
  };
}
