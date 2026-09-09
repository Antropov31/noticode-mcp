export type SessionContext = {
  currentMode: string;
  activeExecutor?: string;
  history: string[];
};

const session: SessionContext = {
  currentMode: "developer",
  history: [],
};

export function updateSession(task: string, mode: string, executor?: string) {
  session.currentMode = mode;
  session.activeExecutor = executor;
  session.history.push(task);
}

export function getSession() {
  return session;
}

export function switchMode(mode: string) {
  session.currentMode = mode;
}
