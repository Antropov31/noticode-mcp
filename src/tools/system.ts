import os from "node:os";
import { z } from "zod";
import type { NotiTool } from "./types.js";

export const systemInfo: NotiTool = {
  name: "sys_info",
  description: "Return host system information: OS, CPU, memory, user, and the active workspace.",
  schema: z.object({}),
  handler: async (_args, ctx) => {
    return JSON.stringify(
      {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        hostname: os.hostname(),
        user: os.userInfo().username,
        cpus: os.cpus().length,
        totalMemGB: +(os.totalmem() / 1e9).toFixed(2),
        freeMemGB: +(os.freemem() / 1e9).toFixed(2),
        workspace: ctx.workspace,
      },
      null,
      2,
    );
  },
};
