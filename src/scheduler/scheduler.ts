import { exec } from "node:child_process";
import { promisify } from "node:util";
import cron from "node-cron";
import type { ToolContext } from "../tools/types.js";

const pexec = promisify(exec);

export type JobType = "shell" | "prompt" | "notify";

export interface Job {
  id: string;
  cron: string;
  type: JobType;
  payload: string;
  createdAt: number;
  lastRun?: number;
  task?: any;
}

export type Notifier = (title: string, message?: string) => Promise<void> | void;
export type PromptRunner = (prompt: string) => Promise<string>;

interface SchedulerOptions {
  ctx?: ToolContext;
  notifier?: Notifier;
  promptRunner?: PromptRunner;
}

/**
 * In-memory cron scheduler. Jobs can run a shell command, run an agent prompt
 * (when a prompt runner is wired in), or just fire a reminder. Results are
 * pushed to the configured notifier (typically Telegram).
 */
class Scheduler {
  private jobs = new Map<string, Job>();
  private ctx?: ToolContext;
  private notifier?: Notifier;
  private promptRunner?: PromptRunner;

  configure(opts: SchedulerOptions): void {
    if (opts.ctx) this.ctx = opts.ctx;
    if (opts.notifier) this.notifier = opts.notifier;
    if (opts.promptRunner) this.promptRunner = opts.promptRunner;
  }

  add(cronExpr: string, type: JobType, payload: string): Job {
    if (!cron.validate(cronExpr)) {
      throw new Error(`Invalid cron expression: ${cronExpr}`);
    }
    const id = Math.random().toString(36).slice(2, 10);
    const job: Job = { id, cron: cronExpr, type, payload, createdAt: Date.now() };
    job.task = cron.schedule(cronExpr, () => {
      void this.run(job);
    });
    this.jobs.set(id, job);
    return job;
  }

  list(): Job[] {
    return [...this.jobs.values()];
  }

  cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    job.task?.stop();
    this.jobs.delete(id);
    return true;
  }

  private async run(job: Job): Promise<void> {
    job.lastRun = Date.now();
    try {
      if (job.type === "shell") {
        const { stdout, stderr } = await pexec(job.payload, {
          cwd: this.ctx?.workspace,
          timeout: 600000,
          maxBuffer: 10 * 1024 * 1024,
          shell: process.platform === "win32" ? undefined : "/bin/bash",
        });
        const out = [stdout, stderr].filter(Boolean).join("\n").trim();
        await this.notifier?.(`Scheduled command finished`, `$ ${job.payload}\n\n${out.slice(0, 800)}`);
      } else if (job.type === "prompt") {
        const out = this.promptRunner
          ? await this.promptRunner(job.payload)
          : "(no agent available: set ANTHROPIC_API_KEY and run in `all` mode)";
        await this.notifier?.(`Scheduled task done`, out.slice(0, 800));
      } else {
        await this.notifier?.("Reminder", job.payload);
      }
    } catch (e: any) {
      await this.notifier?.("Scheduled job failed", `${job.payload}\n\n${e?.message ?? e}`);
    }
  }
}

export const scheduler = new Scheduler();
