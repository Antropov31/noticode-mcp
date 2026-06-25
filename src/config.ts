export interface NotiConfig {
  workspace: string;
  allowShell: boolean;
  allowWrite: boolean;
  model: string;
  maxOutputChars: number;
}

export function loadConfig(overrides: Partial<NotiConfig> = {}): NotiConfig {
  return {
    workspace: process.env.NOTICODE_WORKSPACE || process.cwd(),
    allowShell: process.env.NOTICODE_ALLOW_SHELL !== "false",
    allowWrite: process.env.NOTICODE_ALLOW_WRITE !== "false",
    model: process.env.NOTICODE_MODEL || "claude-sonnet-4-20250514",
    maxOutputChars: Number(process.env.NOTICODE_MAX_OUTPUT || 30000),
    ...overrides,
  };
}
