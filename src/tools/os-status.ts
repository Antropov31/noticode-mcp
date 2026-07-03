import { z } from "zod";
import { promisify } from "node:util";
import { exec as _exec } from "node:child_process";
import os from "node:os";
import type { NotiTool } from "./types.js";

const exec = promisify(_exec);

/** Run a shell command, returning trimmed stdout or "" on any error. */
async function tryExec(cmd: string): Promise<string> {
  try {
    const { stdout } = await exec(cmd);
    return stdout.trim();
  } catch {
    return "";
  }
}

async function battery(): Promise<string> {
  const p = process.platform;
  if (p === "darwin") {
    const out = await tryExec("pmset -g batt");
    const pct = out.match(/(\d+)%/)?.[1];
    const charging = /AC Power|charging/i.test(out) ? "charging" : /discharging/i.test(out) ? "on battery" : "";
    return pct ? `${pct}%${charging ? ` (${charging})` : ""}` : "n/a";
  }
  if (p === "win32") {
    const out = await tryExec("wmic path Win32_Battery get EstimatedChargeRemaining,BatteryStatus /format:list");
    const pct = out.match(/EstimatedChargeRemaining=(\d+)/)?.[1];
    const status = out.match(/BatteryStatus=(\d+)/)?.[1];
    const charging = status === "2" ? "charging" : status ? "on battery" : "";
    return pct ? `${pct}%${charging ? ` (${charging})` : ""}` : "n/a (no battery?)";
  }
  // Linux
  const cap = await tryExec("cat /sys/class/power_supply/BAT0/capacity");
  const st = await tryExec("cat /sys/class/power_supply/BAT0/status");
  return cap ? `${cap}%${st ? ` (${st.toLowerCase()})` : ""}` : "n/a (no battery?)";
}

async function network(): Promise<string> {
  const p = process.platform;
  if (p === "darwin") {
    const ssid = await tryExec(
      "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I | awk '/ SSID/ {print $2}'",
    );
    const route = await tryExec("route -n get default 2>/dev/null | awk '/interface/ {print $2}'");
    if (ssid) return `Wi-Fi "${ssid}"`;
    return route ? `online via ${route}` : "offline?";
  }
  if (p === "win32") {
    const out = await tryExec('netsh wlan show interfaces');
    const ssid = out.match(/^\s*SSID\s*:\s*(.+)$/m)?.[1]?.trim();
    const state = out.match(/^\s*State\s*:\s*(.+)$/m)?.[1]?.trim();
    if (ssid) return `Wi-Fi "${ssid}"${state ? ` (${state})` : ""}`;
    return state ? `Wi-Fi ${state}` : "n/a";
  }
  const ssid = await tryExec("iwgetid -r");
  const route = await tryExec("ip route get 1.1.1.1 2>/dev/null | awk '{print $5; exit}'");
  if (ssid) return `Wi-Fi "${ssid}"`;
  return route ? `online via ${route}` : "offline?";
}

async function volume(): Promise<string> {
  const p = process.platform;
  if (p === "darwin") {
    const vol = await tryExec("osascript -e 'output volume of (get volume settings)'");
    const muted = await tryExec("osascript -e 'output muted of (get volume settings)'");
    return vol ? `${vol}%${muted === "true" ? " (muted)" : ""}` : "n/a";
  }
  if (p === "win32") return "n/a (needs nircmd)";
  const out = await tryExec("pactl get-sink-volume @DEFAULT_SINK@");
  const pct = out.match(/(\d+)%/)?.[1];
  const mute = await tryExec("pactl get-sink-mute @DEFAULT_SINK@");
  return pct ? `${pct}%${/yes/i.test(mute) ? " (muted)" : ""}` : "n/a";
}

async function activeWindow(): Promise<string> {
  try {
    const { windowManager }: any = await (new Function("m", "return import(m)") as (m: string) => Promise<any>)(
      "node-window-manager",
    );
    const w = windowManager.getActiveWindow();
    const title = w && typeof w.getTitle === "function" ? w.getTitle() : "";
    return title || "n/a";
  } catch {
    return "n/a";
  }
}

export const osStatus: NotiTool = {
  name: "os_status",
  description:
    "Read the machine's live status bar: battery level & charging, network/Wi-Fi, output volume & mute, active window title, plus uptime and load. Use it to understand the current state of the system the agent is running on.",
  schema: z.object({}),
  handler: async () => {
    const [batt, net, vol, active] = await Promise.all([battery(), network(), volume(), activeWindow()]);
    const load = os.loadavg().map((n) => n.toFixed(2)).join(", ");
    const upMin = Math.round(os.uptime() / 60);
    const memUsed = ((1 - os.freemem() / os.totalmem()) * 100).toFixed(0);
    return [
      `Battery: ${batt}`,
      `Network: ${net}`,
      `Volume: ${vol}`,
      `Active window: ${active}`,
      `Memory used: ${memUsed}%`,
      `Load avg (1/5/15m): ${load}`,
      `Uptime: ${upMin} min`,
    ].join("\n");
  },
};
