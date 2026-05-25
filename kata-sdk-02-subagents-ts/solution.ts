/**
 * Kata SDK-02: Subagents — Task tool + inline `agents: {...}` definitions
 *
 * What this kata shows that Strands CANNOT do out of the box:
 *
 *   The SDK ships a Task tool (wire name: "Agent") that lets a main
 *   coordinator agent dispatch a subagent in a fresh context window,
 *   with its own system prompt and its own tool restrictions. Strands
 *   has no Task tool — multi-agent composition in Strands means
 *   instantiating multiple Agent objects and orchestrating them
 *   yourself in Python/TS.
 *
 *   Here we define three subagents inline and the coordinator decides
 *   when to dispatch each:
 *
 *     scanner          — Grep/Glob/Read     — finds every TODO/FIXME
 *     security-auditor — Read               — reads context around
 *                                              security findings
 *     estimator        — NO tools           — pure LLM estimation,
 *                                              demonstrates real
 *                                              capability scoping
 *
 *   Each subagent runs in its own conversation and only returns its
 *   final text reply to the coordinator. Tool calls inside a subagent
 *   never reach the main agent's context — that's the value
 *   proposition (separation of concerns + context-window economy).
 *
 * Run:
 *   npm install
 *   export ANTHROPIC_API_KEY="sk-ant-..."
 *   npm start
 */

import "dotenv/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  query,
  type AgentDefinition,
  type HookCallback,
  type Options,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE_DIR = resolve(HERE, "sample");

const Colors = {
  header: (s: string) => `\x1b[1;96m${s}\x1b[0m`,
  user: (s: string) => `\x1b[93m${s}\x1b[0m`,
  main: (s: string) => `\x1b[92m${s}\x1b[0m`,
  scanner: (s: string) => `\x1b[94m${s}\x1b[0m`,
  security: (s: string) => `\x1b[31m${s}\x1b[0m`,
  estimator: (s: string) => `\x1b[35m${s}\x1b[0m`,
  meta: (s: string) => `\x1b[90m${s}\x1b[0m`,
};

// ============================================================================
// Subagent definitions
// ============================================================================
// AgentDefinition has four fields that matter here:
//   description — natural-language hint to the coordinator: "when should I
//                 dispatch this?". The model uses this to decide.
//   prompt      — the subagent's own system prompt.
//   tools       — explicit allow-list. Omitting it inherits the parent's
//                 tools. Passing [] means the subagent has NO tools.
//   model       — optionally use a different model than the coordinator
//                 (e.g. cheaper Haiku for narrow tasks).

const scanner: AgentDefinition = {
  description: "Locates every TODO/FIXME comment in a directory and returns them as a bulleted list of '<file>:<line> — <text>' entries. Use when you need a raw inventory of pending work in a codebase.",
  prompt:
    "You are a TODO scanner. Use Grep to find every TODO and FIXME in the directory the coordinator asks about. " +
    "Return ONLY a markdown bullet list, one line per finding, in the format:\n" +
    "  - `<relative-path>:<line>` — <verbatim text after TODO:/FIXME:>\n" +
    "No prose, no headers, no summary. Sort by filename.",
  tools: ["Grep", "Glob", "Read"],
  model: "claude-haiku-4-5", // cheap subagent for a narrow task
};

const securityAuditor: AgentDefinition = {
  description: "Reviews the source-code CONTEXT around a list of security-tagged TODOs. For each TODO, reads ~10 lines of surrounding code and assesses concrete risk. Use when you have a list of security findings and need them prioritized by severity, not just by what the TODO comment says.",
  prompt:
    "You are a security auditor. The coordinator will hand you a list of TODO " +
    "locations (file:line). For each one, use Read to fetch ~10 lines of context " +
    "around that line and write a one-paragraph risk assessment that goes BEYOND " +
    "the TODO text itself — actually look at the code. End your reply with a " +
    "Severity: header listing each finding as Critical/High/Medium/Low.",
  tools: ["Read"], // intentionally NOT Grep — relies on coordinator handing it locations
};

const estimator: AgentDefinition = {
  description: "Estimates engineering effort (S/M/L) for a list of TODOs based purely on the TODO text. Pure LLM reasoning — no file access. Use when you need a quick first-pass effort estimate without spending tokens on reading code.",
  prompt:
    "You are an engineering-effort estimator. Given a list of TODO descriptions, " +
    "label each as S (≤ half day), M (1–3 days), or L (> 3 days). Output a table " +
    "with two columns: Effort, Description. No tools — work from the text alone.",
  tools: [], // explicit empty list — this subagent has NO tools whatsoever
};

// ============================================================================
// Driver — distinguishes main agent output from each subagent's output
// ============================================================================

function color(who: string) {
  if (who === "main") return Colors.main;
  if (who === "scanner") return Colors.scanner;
  if (who === "security-auditor") return Colors.security;
  if (who === "estimator") return Colors.estimator;
  return Colors.meta;
}

function describeTask(input: Record<string, unknown>): string {
  const subagent = input.subagent_type as string | undefined;
  const desc = input.description as string | undefined;
  return subagent ? `dispatch → ${subagent}  "${desc ?? "?"}"` : JSON.stringify(input).slice(0, 120);
}

async function run(options: Options, userPrompt: string) {
  console.log(Colors.user(`\nUser: ${userPrompt}\n`));
  const stream: AsyncIterable<SDKMessage> = query({ prompt: userPrompt, options });

  for await (const msg of stream) {
    if (msg.type === "assistant") {
      const who = msg.subagent_type ?? "main";
      const paint = color(who);
      for (const b of msg.message.content) {
        if (b.type === "text" && b.text.trim()) {
          console.log(paint(`\n[${who}]`));
          console.log(paint(b.text));
        } else if (b.type === "tool_use") {
          if (b.name === "Agent") {
            // The Task tool — coordinator dispatching a subagent
            console.log(Colors.main(`\n[${who} → Task]  ${describeTask(b.input as Record<string, unknown>)}`));
          } else {
            const args = JSON.stringify(b.input).slice(0, 120);
            console.log(paint(`  [${who}] tool: ${b.name}(${args})`));
          }
        }
      }
    } else if (msg.type === "result" && msg.subtype === "success") {
      console.log(
        Colors.meta(
          `\n[done]  turns=${msg.num_turns}  duration=${msg.duration_ms}ms  cost=$${msg.total_cost_usd.toFixed(4)}`
        )
      );
      // model_usage breaks out cost per model — useful when subagents use cheaper Haiku.
      const usage = msg.modelUsage as Record<string, { costUSD?: number; inputTokens?: number; outputTokens?: number }>;
      for (const [model, data] of Object.entries(usage)) {
        console.log(
          Colors.meta(
            `        ${model}: $${(data.costUSD ?? 0).toFixed(4)}  in=${data.inputTokens ?? 0} out=${data.outputTokens ?? 0}`
          )
        );
      }
    }
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log(Colors.header("=".repeat(70)));
  console.log(Colors.header(" Kata SDK-02: Subagents via Task tool + inline `agents:`"));
  console.log(Colors.header("=".repeat(70)));
  console.log(
    `\nSample directory:   ${SAMPLE_DIR}\n` +
      `Coordinator model:  claude-sonnet-4-5\n` +
      `Subagents:\n` +
      `   scanner           (Grep, Glob, Read)   — haiku\n` +
      `   security-auditor  (Read only)          — inherits sonnet\n` +
      `   estimator         (no tools)           — inherits sonnet\n`
  );

  // SubagentStop fires when a dispatched subagent finishes. Its
  // last_assistant_message field carries the subagent's final text
  // reply — the same reply the coordinator sees as the Task result.
  // Without this hook, subagent text isn't streamed back to the
  // parent process; you only see tool_use blocks.
  const subagentStopHook: HookCallback = async (input) => {
    if (input.hook_event_name !== "SubagentStop") return { continue: true };
    const paint = color(input.agent_type);
    const reply = input.last_assistant_message ?? "(empty)";
    const preview = reply.length > 800 ? reply.slice(0, 800) + "\n...[truncated]" : reply;
    console.log(paint(`\n[${input.agent_type} → coordinator]`));
    console.log(paint(preview));
    return { continue: true };
  };

  const options: Options = {
    model: "claude-sonnet-4-5",
    additionalDirectories: [SAMPLE_DIR],
    permissionMode: "bypassPermissions", // kata focuses on dispatch, not gating
    hooks: { SubagentStop: [{ hooks: [subagentStopHook] }] },
    systemPrompt:
      "You are a tech-debt coordinator. You have three subagents available:\n" +
      "  - scanner: finds TODOs/FIXMEs (returns a bullet list)\n" +
      "  - security-auditor: reads code context around security findings and rates risk\n" +
      "  - estimator: estimates engineering effort (S/M/L) from TODO text alone\n\n" +
      "When given an audit task, dispatch them in the right order, then synthesize their " +
      "outputs into a single prioritized action list at the end. Be terse — let the " +
      "subagents do the heavy lifting.",
    agents: {
      scanner,
      "security-auditor": securityAuditor,
      estimator,
    },
  };

  await run(
    options,
    `Audit the directory ${SAMPLE_DIR}. Produce a single prioritized action list ` +
      `that combines (a) the full TODO inventory, (b) a real risk assessment of any ` +
      `security findings (reading the code, not just the TODO text), and (c) an effort ` +
      `estimate for each item. Use your subagents — don't do their work yourself.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
