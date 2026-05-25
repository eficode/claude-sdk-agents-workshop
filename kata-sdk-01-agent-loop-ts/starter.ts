/**
 * Kata SDK-01 — Starter
 *
 * Goal: get the model to find all TODO/FIXME comments in ./sample
 * using ONLY the built-in agent tools, with every tool call logged
 * by a PreToolUse hook.
 *
 * Hint: you do NOT define any custom tools. The SDK ships Read/Glob/Grep
 * already. Your job is to point the agent at the right directory and
 * wire a hook.
 */

import "dotenv/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  query,
  type HookCallback,
  type Options,
} from "@anthropic-ai/claude-agent-sdk";

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE_DIR = resolve(HERE, "sample");

// ---------------------------------------------------------------------------
// TODO 1: write a PreToolUse hook that LOGS every tool call.
// ---------------------------------------------------------------------------
// - Check input.hook_event_name === "PreToolUse" first (the type is a union).
// - Print: `${input.tool_name}  ${JSON.stringify(input.tool_input).slice(0, 100)}`
// - Return { continue: true } to let the tool proceed.
const preToolUseHook: HookCallback = async (input) => {
  throw new Error("TODO 1: implement the audit-log hook");
};

// ---------------------------------------------------------------------------
// TODO 2: extend the hook to DENY mutating tools.
// ---------------------------------------------------------------------------
// - If input.tool_name is one of Write/Edit/MultiEdit/NotebookEdit, return:
//     {
//       hookSpecificOutput: {
//         hookEventName: "PreToolUse",
//         permissionDecision: "deny",
//         permissionDecisionReason: "kata is read-only",
//       },
//     }
// - Run the bonus prompt and observe that the model adapts.

// ---------------------------------------------------------------------------
// TODO 3: build options and run a query.
// ---------------------------------------------------------------------------
// - additionalDirectories: [SAMPLE_DIR]
// - hooks: { PreToolUse: [{ hooks: [preToolUseHook] }] }
// - systemPrompt to focus the model on exploration
// - DO NOT add mcpServers or call tool() — the whole point is that
//   the built-in tools are enough.
function buildOptions(): Options {
  throw new Error("TODO 3: build options");
}

async function main() {
  const options = buildOptions();
  for await (const msg of query({
    prompt: `In ${SAMPLE_DIR}, find every TODO and FIXME comment. Group them by severity. Do not modify any file.`,
    options,
  })) {
    if (msg.type === "assistant") {
      for (const b of msg.message.content) {
        if (b.type === "text" && b.text.trim()) console.log(`Agent: ${b.text}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
