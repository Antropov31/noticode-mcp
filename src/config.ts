import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

export interface NotiConfig {
  workspace: string;
  allowShell: boolean;
  allowWrite: boolean;
  model: string;
  maxOutputChars: number;
  // HTTP (`serve`) transport
  httpHost: string;
  httpPort: number;
  token?: string;
  httpAllowedHosts: string[];
  httpAllowedOrigins: string[];
  httpMaxSessions: number;
  httpSessionTtlMs: number;
  // Home Assistant
  homeAssistantUrl?: string;
  homeAssistantToken?: string;
}

function parseInteger(name: string, value: string | undefined, fallback: number, min: number, max: number): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadConfig(overrides: Partial<NotiConfig> = {}): NotiConfig {
  const config: NotiConfig = {
    workspace: path.resolve(process.env.NOTICODE_WORKSPACE || process.cwd()),
    allowShell: process.env.NOTICODE_ALLOW_SHELL !== "false",
    allowWrite: process.env.NOTICODE_ALLOW_WRITE !== "false",
    model: process.env.NOTICODE_MODEL || "claude-sonnet-4-20250514",
    maxOutputChars: parseInteger("NOTICODE_MAX_OUTPUT", process.env.NOTICODE_MAX_OUTPUT, 30000, 1, 10_000_000),
    httpHost: process.env.NOTICODE_HOST || "127.0.0.1",
    httpPort: parseInteger("NOTICODE_PORT", process.env.NOTICODE_PORT, 4319, 1, 65535),
    token: process.env.NOTICODE_TOKEN || undefined,
    httpAllowedHosts: parseList(process.env.NOTICODE_ALLOWED_HOSTS),
    httpAllowedOrigins: parseList(process.env.NOTICODE_ALLOWED_ORIGINS),
    httpMaxSessions: parseInteger("NOTICODE_MAX_SESSIONS", process.env.NOTICODE_MAX_SESSIONS, 32, 1, 10_000),
    httpSessionTtlMs: parseInteger(
      "NOTICODE_SESSION_TTL_MS",
      process.env.NOTICODE_SESSION_TTL_MS,
      30 * 60 * 1000,
      10_000,
      24 * 60 * 60 * 1000,
    ),
    homeAssistantUrl: process.env.HOME_ASSISTANT_URL || undefined,
    homeAssistantToken: process.env.HOME_ASSISTANT_TOKEN || undefined,
    ...overrides,
  };

  config.workspace = path.resolve(config.workspace);
  config.httpHost = config.httpHost.trim();
  if (!config.httpHost) throw new Error("NOTICODE_HOST must not be empty.");
  if (!Number.isInteger(config.httpPort) || config.httpPort < 1 || config.httpPort > 65535) {
    throw new Error("httpPort must be an integer between 1 and 65535.");
  }
  if (!Number.isInteger(config.maxOutputChars) || config.maxOutputChars < 1) {
    throw new Error("maxOutputChars must be a positive integer.");
  }
  if (!Number.isInteger(config.httpMaxSessions) || config.httpMaxSessions < 1) {
    throw new Error("httpMaxSessions must be a positive integer.");
  }
  if (!Number.isInteger(config.httpSessionTtlMs) || config.httpSessionTtlMs < 10_000) {
    throw new Error("httpSessionTtlMs must be at least 10000 ms.");
  }
  return config;
}
