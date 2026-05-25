/**
 * Kata SDK-03 — Starter
 *
 * Wire three hooks for an incident-triage agent investigating ./sample.
 * Each hook does a different job:
 *
 *   UserPromptSubmit  → attach a policy preamble to the user's prompt
 *   PostToolUse       → truncate any tool output longer than 30 lines
 *   Stop              → block until the reply has ## Severity: and ## Findings:
 *
 * Hint: each hook callback has the same signature but you must check
 * `input.hook_event_name` first — TypeScript narrows the input type
 * after that check.
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
// TODO 1: UserPromptSubmit — inject a policy preamble.
// ---------------------------------------------------------------------------
// Return:
//   { hookSpecificOutput: { hookEventName: "UserPromptSubmit",
//                            additionalContext: "Policy: ..." } }
const userPromptSubmitHook: HookCallback = async (input) => {
  throw new Error("TODO 1: UserPromptSubmit");
};

// ---------------------------------------------------------------------------
// TODO 2: PostToolUse — truncate tool outputs longer than 30 lines.
// ---------------------------------------------------------------------------
// Read tool's response shape:  { file: { content: string } }
// Bash tool's response shape:  { stdout: string }
//
// Extract the text, count lines, if > 30 rewrite the response in its
// native shape and return:
//   { hookSpecificOutput: { hookEventName: "PostToolUse",
//                            updatedToolOutput: <rewritten> } }
const postToolUseHook: HookCallback = async (input) => {
  throw new Error("TODO 2: PostToolUse");
};

// ---------------------------------------------------------------------------
// TODO 3: Stop — require ## Severity: and ## Findings: in the final reply.
// ---------------------------------------------------------------------------
// Important: check input.stop_hook_active. If true, return { continue: true }
// to avoid an infinite loop.
//
// Otherwise, regex-check input.last_assistant_message for the required
// markdown headers. If missing, return:
//   { decision: "block", reason: "Revise to include ..." }
const stopHook: HookCallback = async (input) => {
  throw new Error("TODO 3: Stop");
};

// ---------------------------------------------------------------------------
// TODO 4: wire all three hooks into options.
// ---------------------------------------------------------------------------
// hooks: {
//   UserPromptSubmit: [{ hooks: [userPromptSubmitHook] }],
//   PostToolUse:      [{ hooks: [postToolUseHook]      }],
//   Stop:             [{ hooks: [stopHook]             }],
// }
function buildOptions(): Options {
  throw new Error("TODO 4: build options");
}

async function main() {
  const options = buildOptions();
  for await (const msg of query({
    prompt: `Something's weird with auth — investigate ${SAMPLE_DIR} and tell me what's wrong.`,
    options,
  })) {
    if (msg.type === "assistant") {
      for (const b of msg.message.content) {
        if (b.type === "text" && b.text.trim()) console.log(b.text);
        else if (b.type === "tool_use") console.log(`tool: ${b.name}`);
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
