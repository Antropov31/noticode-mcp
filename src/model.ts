export type TaskStatus = "open" | "in_progress" | "done" | "blocked";
export type ProposalStatus = "open" | "accepted" | "rejected";
export type MessageType = "info" | "question" | "dependency" | "blocker" | "review" | "proposal";

export interface AgentRecord {
  id: string;
  displayName: string;
  authHash: string;
  joinKeyHash?: string;
  joinedAt: number;
  lastSeenAt: number;
  currentTaskId?: string;
  branch?: string;
  worktreePath?: string;
}

export interface TaskRecord {
  id: string;
  title: string;
  description: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  status: TaskStatus;
  claimedBy?: string;
  dependencies: string[];
  suggestedScopes: string[];
  result?: string;
}

export interface MessageRecord {
  id: string;
  from: string;
  to: string[];
  type: MessageType;
  subject: string;
  body: string;
  threadId?: string;
  taskId?: string;
  createdAt: number;
  readBy: string[];
}

export interface ReservationRecord {
  id: string;
  agentId: string;
  taskId?: string;
  patterns: string[];
  createdAt: number;
  expiresAt: number;
  note?: string;
}

export interface ProposalRecord {
  id: string;
  createdBy: string;
  title: string;
  body: string;
  createdAt: number;
  status: ProposalStatus;
  votes: Record<string, "approve" | "reject" | "abstain">;
  resolution?: string;
}

export interface BarrierRecord {
  stage: string;
  expected: number;
  participants: string[];
  released: boolean;
  updatedAt: number;
}

export interface MemoryRecord {
  id: string;
  key: string;
  content: string;
  tags: string[];
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface SwarmState {
  id: string;
  goal: string;
  repo?: string;
  expectedAgents?: number;
  createdAt: number;
  updatedAt: number;
  agents: AgentRecord[];
  tasks: TaskRecord[];
  messages: MessageRecord[];
  reservations: ReservationRecord[];
  proposals: ProposalRecord[];
  barriers: BarrierRecord[];
  memory: MemoryRecord[];
}

export interface DatabaseState {
  version: 1;
  swarms: Record<string, SwarmState>;
}

export interface AgentAuth {
  swarmId: string;
  agentId: string;
  agentToken: string;
}
