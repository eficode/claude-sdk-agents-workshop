/**
 * Kata 03: Claude Agent SDK with Custom Tools (TypeScript) — Starter
 *
 * Fill in the TODOs. Compare with solution.ts when stuck.
 *
 *   1. Define tools with tool(name, description, zodShape, async handler).
 *   2. Bundle them in createSdkMcpServer({ name, version, tools }).
 *   3. Pass mcpServers + allowedTools (`mcp__<server>__<tool>`) in Options.
 */

import "dotenv/config";
import { z } from "zod";
import {
  query,
  tool,
  createSdkMcpServer,
  type Options,
  type SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";

const textResult = (text: string) => ({ content: [{ type: "text" as const, text }] });

// ---------------------------------------------------------------------------
// TODO 1: get_current_time
// ---------------------------------------------------------------------------
// Zod shape: { tz_name: z.string().default("UTC") }
// Return current ISO timestamp (or formatted UTC).
const getCurrentTime = tool(
  "get_current_time",
  "TODO description",
  { tz_name: z.string().default("UTC") },
  async ({ tz_name }) => {
    throw new Error("TODO 1: implement get_current_time");
  }
);

// ---------------------------------------------------------------------------
// TODO 2: calculate
// ---------------------------------------------------------------------------
// Accept { expression: z.string() }, validate it contains only safe chars
// ([0-9+\-*/().\s]), evaluate it with `new Function(...)` and return the result.
const calculate = tool(
  "calculate",
  "TODO description",
  { expression: z.string() },
  async ({ expression }) => {
    throw new Error("TODO 2: implement calculate");
  }
);

// ---------------------------------------------------------------------------
// TODO 3: wire the MCP server and options
// ---------------------------------------------------------------------------
// - server = createSdkMcpServer({ name: "workshop", version: "1.0.0", tools: [...] })
// - In Options:
//     mcpServers: { workshop: server }
//     allowedTools: ["mcp__workshop__get_current_time", "mcp__workshop__calculate"]
function buildOptions(): Options {
  throw new Error("TODO 3: build options");
}

// ---------------------------------------------------------------------------
// TODO 4: run a query and print text + tool calls
// ---------------------------------------------------------------------------
async function run(prompt: string) {
  const options = buildOptions();
  for await (const msg of query({ prompt, options })) {
    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text" && block.text.trim()) {
          console.log(`Agent: ${block.text}`);
        } else if (block.type === "tool_use") {
          console.log(`  → tool: ${block.name}(${JSON.stringify(block.input)})`);
        }
      }
    }
  }
}

async function main() {
  await run("What time is it, and what is 12 * 9 + 3?");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
