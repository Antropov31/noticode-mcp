import "dotenv/config";
import path from "node:path";

const bool = (value: string | undefined, fallback: boolean): boolean => {
  if (value == null) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

const int = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

export type WorkspaceMode = "worktree" | "shared";

const workspaceMode = (value: string | undefined): WorkspaceMode => {
  const normalized = value?.trim().toLowerCase();
  return normalized === "shared" ? "shared" : "worktree";
};

export interface CloudConfig {
  host: string;
  port: number;
  mcpToken?: string;
  runnerToken: string;
  statePath: string;
  agentStaleMs: number;
  defaultReservationTtlMs: number;
  runnerTimeoutMs: number;
}

export interface RunnerConfig {
  cloudUrl: string;
  runnerToken: string;
  workspace: string;
  runnerId: string;
  workspaceMode: WorkspaceMode;
  baseRef: string;
  buildCommand: string;
  allowExec: boolean;
  allowedPrefixes: string[];
  worktreeRoot: string;
}

export function loadCloudConfig(): CloudConfig {
  return {
    host: process.env.ANTRO_HOST ?? "0.0.0.0",
    port: int(process.env.ANTRO_PORT, 4320),
    mcpToken: process.env.ANTRO_MCP_TOKEN || undefined,
    runnerToken: process.env.ANTRO_RUNNER_TOKEN ?? "",
    statePath: path.resolve(process.env.ANTRO_STATE_PATH ?? ".antroswarm/state.json"),
    agentStaleMs: int(process.env.ANTRO_AGENT_STALE_MS, 5 * 60_000),
    defaultReservationTtlMs: int(process.env.ANTRO_DEFAULT_RESERVATION_TTL_MS, 30 * 60_000),
    runnerTimeoutMs: int(process.env.ANTRO_RUNNER_TIMEOUT_MS, 120_000),
  };
}

export function loadRunnerConfig(): RunnerConfig {
  const workspace = path.resolve(process.env.ANTRO_WORKSPACE ?? process.cwd());
  const worktreeRoot = path.resolve(
    process.env.ANTRO_WORKTREE_ROOT ?? path.join(path.dirname(workspace), ".antroswarm-worktrees", path.basename(workspace)),
  );
  return {
    cloudUrl: (process.env.ANTRO_CLOUD_URL ?? "http://127.0.0.1:4320").replace(/\/$/, ""),
    runnerToken: process.env.ANTRO_RUNNER_TOKEN ?? "",
    workspace,
    runnerId: process.env.ANTRO_RUNNER_ID ?? "local-runner",
    workspaceMode: workspaceMode(process.env.ANTRO_WORKSPACE_MODE),
    baseRef: process.env.ANTRO_BASE_REF ?? "origin/main",
    buildCommand: process.env.ANTRO_BUILD_COMMAND ?? (process.platform === "win32" ? "gradlew.bat clean build" : "./gradlew clean build"),
    allowExec: bool(process.env.ANTRO_RUNNER_ALLOW_EXEC, false),
    allowedPrefixes: (process.env.ANTRO_RUNNER_ALLOWED_PREFIXES ?? "git,npm,npx,pnpm,yarn,gradle,gradlew,gradlew.bat,mvn,mvnw")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    worktreeRoot,
  };
}
