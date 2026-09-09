export interface AgentSystemStatus {
  mode: string;
  currentTask: string | null;
  loadedSkills: string[];
  loadedExecutors: string[];
  memoryReady: boolean;
}

export function createSystemStatus(data: Partial<AgentSystemStatus> = {}): AgentSystemStatus {
  return {
    mode: data.mode ?? "developer",
    currentTask: data.currentTask ?? null,
    loadedSkills: data.loadedSkills ?? [],
    loadedExecutors: data.loadedExecutors ?? [],
    memoryReady: data.memoryReady ?? false,
  };
}
