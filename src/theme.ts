import chalk from "chalk";

// NotiCode blue palette — blue, never orange.
export const colors = {
  primary: "#2F80ED",
  bright: "#56CCF2",
  deep: "#1B4F9C",
  accent: "#00B8D9",
  muted: "#7B8FA1",
};

export const blue = chalk.hex(colors.primary);
export const sky = chalk.hex(colors.bright);
export const deep = chalk.hex(colors.deep);
export const accent = chalk.hex(colors.accent);
export const muted = chalk.hex(colors.muted);

export const banner = [
  "",
  sky("  ▸█ ") + blue.bold("NotiCode"),
  muted("  the blue coding agent · MCP-native"),
  "",
].join("\n");
