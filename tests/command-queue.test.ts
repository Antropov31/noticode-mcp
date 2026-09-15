import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CommandQueue } from "../src/command-queue.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

test("expired delivery lease is automatically requeued", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antroswarm-lease-"));
  const queue = new CommandQueue(path.join(dir, "commands.json"), 20);
  const command = await queue.enqueue({ swarmId: "s", prompt: "recover me", targetAgentIds: ["a"] });
  const first = await queue.next("s", "a");
  assert.equal(first?.deliveries.a.status, "delivered");
  assert.equal(first?.deliveries.a.attempts, 1);
  await sleep(30);
  const second = await queue.next("s", "a");
  assert.equal(second?.id, command.id);
  assert.equal(second?.deliveries.a.status, "delivered");
  assert.equal(second?.deliveries.a.attempts, 2);
});

test("requestId makes dashboard enqueue idempotent", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antroswarm-idempotent-command-"));
  const queue = new CommandQueue(path.join(dir, "commands.json"));
  const first = await queue.enqueue({ swarmId: "s", prompt: "once", targetAgentIds: ["a"], requestId: "browser-request-1" });
  const retry = await queue.enqueue({ swarmId: "s", prompt: "once", targetAgentIds: ["a"], requestId: "browser-request-1" });
  assert.equal(retry.id, first.id);
  assert.equal((await queue.list("s")).length, 1);
});

test("broadcast fanout supports ten independent agent deliveries", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antroswarm-ten-agents-"));
  const queue = new CommandQueue(path.join(dir, "commands.json"));
  const agents = Array.from({ length: 10 }, (_, i) => `agent-${i + 1}`);
  const command = await queue.enqueue({ swarmId: "ten", prompt: "build together", targetAgentIds: agents });
  await Promise.all(agents.map(async (agentId) => {
    const item = await queue.next("ten", agentId);
    assert.equal(item?.id, command.id);
    await queue.ack("ten", agentId, command.id);
    await queue.report({ swarmId: "ten", agentId, commandId: command.id, status: "done", result: agentId });
  }));
  const [saved] = await queue.list("ten");
  assert.equal(Object.values(saved.deliveries).filter((d) => d.status === "done").length, 10);
});
