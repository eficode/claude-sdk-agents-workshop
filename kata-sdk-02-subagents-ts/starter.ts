/**
 * Kata SDK-02 — Starter
 *
 * Build a tech-debt audit coordinator that dispatches two subagents:
 *   - scanner: finds TODOs/FIXMEs in ./sample
 *   - estimator: rates effort S/M/L (no tools — pure reasoning)
 *
 * The coordinator synthesizes their outputs into a prioritized list.
 *
 * Hint: you don't need any custom MCP tools. The SDK ships Grep/Read,
 * and the Task tool turns on automatically when `agents:` is set.
 */

import "dotenv/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  query,
  type AgentDefinition,
  type Options,
} from "@anthropic-ai/claude-agent-sdk";

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE_DIR = resolve(HERE, "sample");

// ---------------------------------------------------------------------------
// TODO 1: define `scanner` — must use Grep/Glob/Read, ideally on Haiku.
// ---------------------------------------------------------------------------
// description: tell the coordinator WHEN to use this subagent
// prompt:      tell the subagent HOW to behave
// tools:       ["Grep", "Glob", "Read"]
// model:       "claude-haiku-4-5"
const scanner: AgentDefinition = {
  description: "TODO description",
  prompt: "TODO prompt",
};

// ---------------------------------------------------------------------------
// TODO 2: define `estimator` — must have NO tools (tools: []).
// ---------------------------------------------------------------------------
const estimator: AgentDefinition = {
  description: "TODO description",
  prompt: "TODO prompt",
};

// ---------------------------------------------------------------------------
// TODO 3: build options.
// ---------------------------------------------------------------------------
// - model: "claude-sonnet-4-5" (the coordinator)
// - additionalDirectories: [SAMPLE_DIR]
// - permissionMode: "bypassPermissions"
// - systemPrompt: tell the coordinator about its two subagents
// - agents: { scanner, estimator }
function buildOptions(): Options {
  throw new Error("TODO 3: build options");
}

// ---------------------------------------------------------------------------
// TODO 4 (bonus): add a SubagentStop hook to print each subagent's final reply.
// ---------------------------------------------------------------------------
// hooks: { SubagentStop: [{ hooks: [...] }] }
// The callback's input has .agent_type and .last_assistant_message.

async function main() {
  const options = buildOptions();
  for await (const msg of query({
    prompt: `Audit ${SAMPLE_DIR}. Use your subagents to gather findings and effort estimates, then produce a single prioritized list.`,
    options,
  })) {
    if (msg.type === "assistant") {
      const who = msg.subagent_type ?? "main";
      for (const b of msg.message.content) {
        if (b.type === "text" && b.text.trim()) console.log(`[${who}] ${b.text}`);
        else if (b.type === "tool_use") console.log(`[${who}] tool: ${b.name}`);
      }
    } else if (msg.type === "result" && msg.subtype === "success") {
      console.log(`turns=${msg.num_turns} cost=$${msg.total_cost_usd.toFixed(4)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
