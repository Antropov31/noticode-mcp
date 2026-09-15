import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../src/store.js";
import { Coordinator } from "../src/coordinator.js";

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antroswarm-"));
  const coordinator = new Coordinator(new JsonStore(path.join(dir, "state.json")), 60_000, 60_000);
  const a = await coordinator.join({ swarmId: "test", displayName: "A", goal: "ship", expectedAgents: 2 });
  const b = await coordinator.join({ swarmId: "test", displayName: "B" });
  const authA = { swarmId: "test", agentId: a.agentId, agentToken: a.agentToken };
  const authB = { swarmId: "test", agentId: b.agentId, agentToken: b.agentToken };
  return { coordinator, authA, authB };
}

test("task dependencies and atomic claim", async () => {
  const { coordinator, authA, authB } = await fixture();
  const base = await coordinator.createTask(authA, { title: "base" });
  const child = await coordinator.createTask(authA, { title: "child", dependencies: [base.id] });
  await assert.rejects(() => coordinator.claimTask(authB, child.id), /blocked/);
  await coordinator.claimTask(authA, base.id);
  await coordinator.completeTask(authA, base.id, "done");
  const claimed = await coordinator.claimTask(authB, child.id);
  assert.equal(claimed.claimedBy, authB.agentId);
  await assert.rejects(() => coordinator.claimTask(authA, child.id), /not open/);
});

test("conflicting path reservations are rejected", async () => {
  const { coordinator, authA, authB } = await fixture();
  await coordinator.reservePaths(authA, { patterns: ["src/entity/**"] });
  await assert.rejects(() => coordinator.reservePaths(authB, { patterns: ["src/entity/Hollow.java"] }), /conflict/i);
  await coordinator.reservePaths(authB, { patterns: ["src/menu/**"] });
  await assert.rejects(() => coordinator.assertWritable(authB, "src/entity/Hollow.java"), /blocked/i);
  await coordinator.assertWritable(authB, "src/menu/Menu.java");
});

test("barrier releases only when expected agents arrive", async () => {
  const { coordinator, authA, authB } = await fixture();
  const first = await coordinator.barrier(authA, "analysis");
  assert.equal(first.state, "waiting");
  const second = await coordinator.barrier(authB, "analysis");
  assert.equal(second.state, "released");
  assert.equal(second.ready, 2);
});

test("mail is durable and scoped to recipient", async () => {
  const { coordinator, authA, authB } = await fixture();
  await coordinator.sendMessage(authA, { to: [authB.agentId], type: "dependency", subject: "API", body: "need memory getter" });
  assert.equal((await coordinator.inbox(authA)).length, 0);
  const inbox = await coordinator.inbox(authB);
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].subject, "API");
  assert.equal((await coordinator.inbox(authB)).length, 0);
});
