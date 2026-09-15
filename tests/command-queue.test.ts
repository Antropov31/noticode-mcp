import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CommandQueue } from "../src/command-queue.js";

test("command queue delivers independently to each target and persists status", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antroswarm-commands-"));
  const filename = path.join(dir, "commands.json");
  const queue = new CommandQueue(filename);
  const command = await queue.enqueue({ swarmId: "s1", prompt: "Do the thing", targetAgentIds: ["a", "b"] });

  const forA = await queue.next("s1", "a");
  assert.equal(forA?.id, command.id);
  assert.equal(forA?.deliveries.a.status, "delivered");
  await queue.ack("s1", "a", command.id);
  await queue.report({ swarmId: "s1", agentId: "a", commandId: command.id, status: "done", result: "ok" });

  const forB = await queue.next("s1", "b");
  assert.equal(forB?.id, command.id);
  assert.equal(forB?.deliveries.b.status, "delivered");

  const reloaded = new CommandQueue(filename);
  const [saved] = await reloaded.list("s1");
  assert.equal(saved.deliveries.a.status, "done");
  assert.equal(saved.deliveries.a.result, "ok");
  assert.equal(saved.deliveries.b.status, "delivered");
});

test("long poll returns null when no command arrives", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antroswarm-commands-"));
  const queue = new CommandQueue(path.join(dir, "commands.json"));
  const result = await queue.next("missing", "agent", 10);
  assert.equal(result, null);
});
