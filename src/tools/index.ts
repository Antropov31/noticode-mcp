import { readFile, writeFile, editFile, listDir, search } from "./filesystem.js";
import { shellExec } from "./shell.js";
import { systemInfo } from "./system.js";
import { screenCapture, webcamCapture } from "./capture.js";
import {
  browserNavigate,
  browserClick,
  browserType,
  browserEval,
  browserScreenshot,
} from "./browser.js";
import { notify } from "./notify.js";
import type { NotiTool } from "./types.js";

export const tools: NotiTool[] = [
  // Filesystem
  readFile,
  writeFile,
  editFile,
  listDir,
  search,
  // Shell + system
  shellExec,
  systemInfo,
  // Vision: let the agent see the machine it runs on
  screenCapture,
  webcamCapture,
  // Headless browser
  browserNavigate,
  browserClick,
  browserType,
  browserEval,
  browserScreenshot,
  // Notifications
  notify,
];

export type { NotiTool, ToolContext } from "./types.js";
