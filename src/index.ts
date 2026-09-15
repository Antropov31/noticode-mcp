#!/usr/bin/env node
import { loadCloudConfig, loadRunnerConfig } from "./config.js";
import { startCloud } from "./http.js";
import { LocalRunner } from "./runner/local.js";

const command = process.argv[2] ?? "serve";

async function main(): Promise<void> {
  if (command === "serve" || command === "cloud") {
    await startCloud(loadCloudConfig());
    return;
  }
  if (command === "runner") {
    const config = loadRunnerConfig();
    console.log(`AntroSwarm runner '${config.runnerId}' connecting to ${config.cloudUrl}`);
    console.log(`Workspace: ${config.workspace}`);
    console.log(`Worktrees: ${config.worktreeRoot}`);
    await new LocalRunner(config).start();
  }
  if (["help", "--help", "-h"].includes(command)) {
    console.log(`AntroSwarm\n\n  antroswarm serve   Start public Streamable HTTP MCP + runner websocket\n  antroswarm runner  Start outbound local PC runner\n\nSee README.md and .env.example.`);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
