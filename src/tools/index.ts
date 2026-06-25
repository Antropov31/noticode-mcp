import { readFile, writeFile, editFile, listDir, search } from "./filesystem.js";
import { shellExec } from "./shell.js";
import { systemInfo } from "./system.js";
import type { NotiTool } from "./types.js";

export const tools: NotiTool[] = [
  readFile,
  writeFile,
  editFile,
  listDir,
  search,
  shellExec,
  systemInfo,
];

export type { NotiTool, ToolContext } from "./types.js";
