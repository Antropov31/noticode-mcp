import { z } from "zod";
import { promisify } from "node:util";
import { exec as _exec } from "node:child_process";
import type { NotiTool } from "./types.js";

const exec = promisify(_exec);

/** Quote a string for safe use as a single shell argument. */
function q(s: string): string {
  if (process.platform === "win32") return `\"${s.replace(/\"/g, '\\\"')}\"`;
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const desktopOpen: NotiTool = {
  name: "desktop_open",
  description:
    "Open a file, folder, or URL with the system default handler, or launch an application by name. Cross-platform (macOS, Windows, Linux).",
  schema: z.object({
    target: z.string().describe("A file path, folder path, URL, or (with as_app) an application name."),
    as_app: z.boolean().optional().describe("Treat target as an application to launch rather than a document."),
    args: z.array(z.string()).optional().describe("Extra arguments to pass to the launched app."),
  }),
  handler: async (args) => {
    const extra = (args.args ?? []).map(q).join(" ");
    let cmd: string;
    if (process.platform === "darwin") {
      cmd = args.as_app
        ? `open -a ${q(args.target)}${extra ? ` --args ${extra}` : ""}`
        : `open ${q(args.target)}`;
    } else if (process.platform === "win32") {
      cmd = `start "" ${q(args.target)} ${extra}`.trim();
    } else {
      cmd = args.as_app ? `${q(args.target)} ${extra}`.trim() : `xdg-open ${q(args.target)}`;
    }
    await exec(cmd);
    return `${args.as_app ? "Launched" : "Opened"} ${args.target}.`;
  },
};

export const desktopPower: NotiTool = {
  name: "desktop_power",
  description:
    "Control the machine power state: lock the screen, sleep, shut down, restart, or log out. Cross-platform.",
  schema: z.object({
    action: z.enum(["lock", "sleep", "shutdown", "restart", "logout"]).describe("Power action to perform."),
  }),
  handler: async (args) => {
    const p = process.platform;
    const table: Record<string, Record<string, string>> = {
      darwin: {
        lock: `pmset displaysleepnow`,
        sleep: `pmset sleepnow`,
        shutdown: `osascript -e 'tell app "System Events" to shut down'`,
        restart: `osascript -e 'tell app "System Events" to restart'`,
        logout: `osascript -e 'tell app "System Events" to log out'`,
      },
      win32: {
        lock: `rundll32.exe user32.dll,LockWorkStation`,
        sleep: `rundll32.exe powrprof.dll,SetSuspendState 0,1,0`,
        shutdown: `shutdown /s /t 0`,
        restart: `shutdown /r /t 0`,
        logout: `shutdown /l`,
      },
      linux: {
        lock: `loginctl lock-session || xdg-screensaver lock`,
        sleep: `systemctl suspend`,
        shutdown: `systemctl poweroff`,
        restart: `systemctl reboot`,
        logout: `loginctl terminate-user "$USER"`,
      },
    };
    const cmds = table[p] ?? table.linux;
    const cmd = cmds[args.action];
    if (!cmd) throw new Error(`Action ${args.action} not supported on ${p}.`);
    await exec(cmd);
    return `Requested ${args.action} on ${p}.`;
  },
};

export const desktopVolume: NotiTool = {
  name: "desktop_volume",
  description:
    "Set the system output volume (0-100) or mute/unmute. On Windows this requires nircmd on PATH.",
  schema: z.object({
    level: z.number().int().min(0).max(100).optional().describe("Volume percentage 0-100."),
    mute: z.boolean().optional().describe("true to mute, false to unmute."),
  }),
  handler: async (args) => {
    if (args.level == null && args.mute == null)
      throw new Error("Provide level and/or mute.");
    const p = process.platform;
    const cmds: string[] = [];
    if (p === "darwin") {
      if (args.level != null) cmds.push(`osascript -e 'set volume output volume ${args.level}'`);
      if (args.mute != null) cmds.push(`osascript -e 'set volume output muted ${args.mute ? "true" : "false"}'`);
    } else if (p === "win32") {
      if (args.level != null) cmds.push(`nircmd.exe setsysvolume ${Math.round((args.level / 100) * 65535)}`);
      if (args.mute != null) cmds.push(`nircmd.exe mutesysvolume ${args.mute ? 1 : 0}`);
    } else {
      if (args.level != null)
        cmds.push(`pactl set-sink-volume @DEFAULT_SINK@ ${args.level}% || amixer set Master ${args.level}%`);
      if (args.mute != null)
        cmds.push(`pactl set-sink-mute @DEFAULT_SINK@ ${args.mute ? 1 : 0} || amixer set Master ${args.mute ? "mute" : "unmute"}`);
    }
    for (const c of cmds) await exec(c);
    const parts = [
      args.level != null ? `volume ${args.level}%` : null,
      args.mute != null ? (args.mute ? "muted" : "unmuted") : null,
    ].filter(Boolean);
    return `Set ${parts.join(", ")}.`;
  },
};
