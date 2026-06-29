import { z } from "zod";
import type { NotiTool } from "./types.js";
import { scheduler } from "../scheduler/scheduler.js";

export const scheduleAdd: NotiTool = {
  name: "schedule_add",
  description:
    "Schedule a recurring job with a cron expression. type 'shell' runs a command, 'prompt' runs an agent task, 'notify' sends a reminder. You're notified (via Telegram if set up) when shell/prompt jobs finish. Example cron: '0 9 * * *' = every day at 9am.",
  schema: z.object({
    cron: z.string().describe("Cron expression, e.g. '*/30 * * * *' or '0 9 * * 1-5'."),
    type: z.enum(["shell", "prompt", "notify"]).describe("What kind of job to run."),
    payload: z.string().describe("The command (shell), the instruction (prompt), or the reminder text (notify)."),
  }),
  handler: async (args) => {
    const job = scheduler.add(args.cron, args.type, args.payload);
    return `Scheduled job ${job.id} (${args.type}) on '${args.cron}'.`;
  },
};

export const scheduleList: NotiTool = {
  name: "schedule_list",
  description: "List all currently scheduled jobs.",
  schema: z.object({}),
  handler: async () => {
    const jobs = scheduler.list();
    if (jobs.length === 0) return "(no scheduled jobs)";
    return jobs
      .map((j) => {
        const last = j.lastRun ? new Date(j.lastRun).toISOString() : "never";
        return `${j.id}  [${j.type}]  '${j.cron}'  last: ${last}\n   ${j.payload}`;
      })
      .join("\n");
  },
};

export const scheduleCancel: NotiTool = {
  name: "schedule_cancel",
  description: "Cancel a scheduled job by its id (from schedule_list).",
  schema: z.object({
    id: z.string().describe("The job id to cancel."),
  }),
  handler: async (args) => {
    return scheduler.cancel(args.id)
      ? `Cancelled job ${args.id}.`
      : `No job found with id ${args.id}.`;
  },
};
