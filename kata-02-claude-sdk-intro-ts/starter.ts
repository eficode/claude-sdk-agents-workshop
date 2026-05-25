/**
 * Kata 02: Claude Agent SDK Introduction (TypeScript) — Starter
 *
 * Fill in the TODOs. Compare with solution.ts when stuck.
 *
 * Prerequisites:
 *   npm install
 *   export ANTHROPIC_API_KEY="sk-ant-..."
 *   npm run starter
 */

import "dotenv/config";
import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";

const DEFAULT_MODEL = "claude-haiku-4-5";

function baseOptions(overrides: Partial<Options> = {}): Options {
  return { model: DEFAULT_MODEL, allowedTools: [], ...overrides };
}

/**
 * Drain an SDK message stream into the final text + the session_id
 * for follow-up turns. The SDK yields typed messages — only the
 * 'assistant' messages contain text the model produced for the user.
 */
async function collect(
  stream: AsyncIterable<SDKMessage>
): Promise<{ text: string; sessionId: string | null }> {
  const parts: string[] = [];
  let sessionId: string | null = null;
  for await (const msg of stream) {
    if (msg.type === "assistant") {
      sessionId = msg.session_id;
      for (const block of msg.message.content) {
        if (block.type === "text") parts.push(block.text);
      }
    } else if (msg.type === "result") {
      sessionId = msg.session_id;
    }
  }
  return { text: parts.join(""), sessionId };
}

// ---------------------------------------------------------------------------
// TODO 1: one-shot query
// ---------------------------------------------------------------------------
// - Call query({ prompt, options: baseOptions() }).
// - await collect(...) and print result.text.
async function demoBasicQuery() {
  throw new Error("TODO 1: one-shot query");
}

// ---------------------------------------------------------------------------
// TODO 2: system prompt
// ---------------------------------------------------------------------------
// - baseOptions({ systemPrompt: "You are a friendly weather assistant..." })
// - Ask "Why is the sky blue?" and print the answer.
async function demoSystemPrompt() {
  throw new Error("TODO 2: system prompt");
}

// ---------------------------------------------------------------------------
// TODO 3: multi-turn via resume
// ---------------------------------------------------------------------------
// - Turn 1: ask "My name is Alice and I study meteorology." Capture sessionId.
// - Turn 2: ask "What's my name and what do I study?" using
//   baseOptions({ resume: sessionId }). It should remember Alice.
async function demoMultiTurn() {
  throw new Error("TODO 3: multi-turn via resume");
}

async function main() {
  await demoBasicQuery();
  await demoSystemPrompt();
  await demoMultiTurn();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
