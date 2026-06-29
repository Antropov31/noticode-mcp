import { readFile, writeFile, editFile, listDir, search } from "./filesystem.js";
import { shellExec } from "./shell.js";
import { systemInfo } from "./system.js";
import { tgSend, tgSendPhoto, tgRead } from "./telegram.js";
import { notify } from "./notify.js";
import { haStates, haCallService } from "./home-assistant.js";
import {
  browserNavigate,
  browserClick,
  browserType,
  browserEval,
  browserScreenshot,
} from "./browser.js";
import { screenCapture, webcamCapture } from "./capture.js";
import { scheduleAdd, scheduleList, scheduleCancel } from "./scheduler.js";
import type { NotiTool } from "./types.js";

export const tools: NotiTool[] = [
  // filesystem
  readFile,
  writeFile,
  editFile,
  listDir,
  search,
  // shell + system
  shellExec,
  systemInfo,
  // telegram + notifications
  tgSend,
  tgSendPhoto,
  tgRead,
  notify,
  // home assistant
  haStates,
  haCallService,
  // browser
  browserNavigate,
  browserClick,
  browserType,
  browserEval,
  browserScreenshot,
  // capture
  screenCapture,
  webcamCapture,
  // scheduler
  scheduleAdd,
  scheduleList,
  scheduleCancel,
];

export type { NotiTool, ToolContext } from "./types.js";
