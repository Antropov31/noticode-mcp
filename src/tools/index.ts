import { readFile, writeFile, editFile, listDir, search } from "./filesystem.js";
import { shellExec } from "./shell.js";
import { systemInfo } from "./system.js";
import { screenCapture, webcamCapture } from "./capture.js";
import { screenWatch } from "./screen-stream.js";
import {
  browserNavigate,
  browserClick,
  browserType,
  browserEval,
  browserScreenshot,
} from "./browser.js";
import {
  inputMove,
  inputClick,
  inputMouseButton,
  inputDrag,
  inputDraw,
  inputDrawShape,
  inputMoveRelative,
  inputCursorPosition,
  inputScreenSize,
  inputWait,
  inputType,
  inputKey,
  inputScroll,
} from "./input.js";
import { desktopOpen, desktopPower, desktopVolume } from "./desktop.js";
import { clipboardRead, clipboardWrite } from "./clipboard.js";
import { micCapture, audioPlay } from "./audio.js";
import { osNotify } from "./os-notify.js";
import { fsWatch } from "./watch.js";
import { haStates, haCallService } from "./home-assistant.js";
import { notify } from "./notify.js";
import type { NotiTool } from "./types.js";

export const tools: NotiTool[] = [
  // Filesystem
  readFile,
  writeFile,
  editFile,
  listDir,
  search,
  fsWatch,
  // Shell + system
  shellExec,
  systemInfo,
  // Vision: let the agent see the machine it runs on
  screenCapture,
  webcamCapture,
  screenWatch,
  // Input control: mouse + keyboard
  inputMove,
  inputClick,
  inputMouseButton,
  inputDrag,
  inputDraw,
  inputDrawShape,
  inputMoveRelative,
  inputCursorPosition,
  inputScreenSize,
  inputWait,
  inputType,
  inputKey,
  inputScroll,
  // Desktop control
  desktopOpen,
  desktopPower,
  desktopVolume,
  // Clipboard
  clipboardRead,
  clipboardWrite,
  // Audio
  micCapture,
  audioPlay,
  // Headless browser
  browserNavigate,
  browserClick,
  browserType,
  browserEval,
  browserScreenshot,
  // Smart home
  haStates,
  haCallService,
  // Notifications
  osNotify,
  notify,
];

export type { NotiTool, ToolContext } from "./types.js";
