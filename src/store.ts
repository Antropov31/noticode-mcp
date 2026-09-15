import fs from "node:fs/promises";
import path from "node:path";
import type { DatabaseState } from "./model.js";

const EMPTY: DatabaseState = { version: 1, swarms: {} };

export class JsonStore {
  private state: DatabaseState | null = null;
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly filename: string) {}

  private async load(): Promise<DatabaseState> {
    if (this.state) return this.state;
    try {
      const raw = await fs.readFile(this.filename, "utf8");
      const parsed = JSON.parse(raw) as DatabaseState;
      this.state = parsed.version === 1 ? parsed : structuredClone(EMPTY);
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
      this.state = structuredClone(EMPTY);
    }
    return this.state;
  }

  private async persist(): Promise<void> {
    if (!this.state) return;
    await fs.mkdir(path.dirname(this.filename), { recursive: true });
    const tmp = `${this.filename}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.state, null, 2), "utf8");
    await fs.rename(tmp, this.filename);
  }

  async read<T>(fn: (state: DatabaseState) => T): Promise<T> {
    await this.chain;
    const state = await this.load();
    return fn(structuredClone(state));
  }

  async transaction<T>(fn: (state: DatabaseState) => T | Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.chain;
    this.chain = new Promise<void>((resolve) => (release = resolve));
    await previous;
    try {
      const state = await this.load();
      const result = await fn(state);
      await this.persist();
      return result;
    } finally {
      release();
    }
  }
}
