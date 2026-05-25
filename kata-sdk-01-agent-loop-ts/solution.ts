/**
 * Kata SDK-01: The built-in agent loop, observed and gated by a PreToolUse hook
 *
 * What this kata shows that Strands CANNOT do out of the box:
 *
 *   1. The SDK ships an agentic toolset (Read/Glob/Grep/Bash/Edit/Write/…).
 *      With Strands you'd have to write each of those as a @tool yourself.
 *      Here we give the model a task and pass NO custom tools — it solves
 *      the task by navigating the sample/ directory itself.
 *
 *   2. A PreToolUse hook fires before EVERY tool call, regardless of
 *      whether the SDK would auto-allow it. We use it for two things at
 *      once: an audit log (what did the model try?) and a hard gate
 *      (return permissionDecision: 'deny' to block).
 *
 *      ➤ Side note: canUseTool exists too, but it only fires when the
 *        SDK would otherwise prompt — read-only tools get classified as
 *        safe and skip it. For consistent observation + gating in
 *        headless code, PreToolUse is the right hammer.
 *
 * Run:
 *   npm install
 *   export ANTHROPIC_API_KEY="sk-ant-..."
 *   npm start              # gate enabled (default)
 *   npm run no-gate        # gate disabled — bonus query actually writes
 */

import "dotenv/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, unlinkSync } from "node:fs";
import {
  query,
  type HookCallback,
  type Options,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE_DIR = resolve(HERE, "sample");

const Colors = {
  header: (s: string) => `\x1b[1;96m${s}\x1b[0m`,
  user: (s: string) => `\x1b[93m${s}\x1b[0m`,
  agent: (s: string) => `\x1b[92m${s}\x1b[0m`,
  tool: (s: string) => `\x1b[94m${s}\x1b[0m`,
  allow: (s: string) => `\x1b[32m${s}\x1b[0m`,
  deny: (s: string) => `\x1b[31m${s}\x1b[0m`,
};

// ============================================================================
// The PreToolUse hook
// ============================================================================
// Read-only policy:
//   Read / Glob / Grep                  → allow (logged)
//   Bash with read-only command         → allow (logged)
//   Bash with anything else             → deny
//   Write / Edit / NotebookEdit / etc.  → deny
//   Anything unknown                    → deny (fail closed)
//
// Returning `permissionDecision: 'deny'` from PreToolUse short-circuits
// the tool call BEFORE it runs — the model gets a tool_result containing
// the deny reason and adapts its plan in the next turn. That's the loop.

const READ_ONLY_BASH = /^\s*(ls|cat|head|tail|wc|grep|find|file|stat|pwd|echo|which|test)\b/;

function summarize(toolName: string, input: unknown): string {
  const inp = input as Record<string, unknown>;
  if (toolName === "Read") return String(inp.file_path ?? "").replace(SAMPLE_DIR, "sample");
  if (toolName === "Glob") return `pattern=${inp.pattern} path=${inp.path ?? "."}`;
  if (toolName === "Grep") return `pattern=${JSON.stringify(inp.pattern)} path=${inp.path ?? "."}`;
  if (toolName === "Bash") return `command=${JSON.stringify(inp.command)}`.slice(0, 120);
  if (toolName === "Write" || toolName === "Edit") return `file_path=${inp.file_path}`;
  return JSON.stringify(inp).slice(0, 120);
}

function decide(toolName: string, input: unknown): { allow: boolean; reason?: string } {
  if (["Read", "Glob", "Grep"].includes(toolName)) return { allow: true };
  if (toolName === "Bash") {
    const cmd = String((input as Record<string, unknown>).command ?? "");
    if (READ_ONLY_BASH.test(cmd)) return { allow: true };
    return { allow: false, reason: "Only read-only bash commands are permitted in this kata." };
  }
  if (["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(toolName)) {
    return { allow: false, reason: `${toolName} is disabled — this kata is read-only.` };
  }
  return { allow: false, reason: `${toolName} is not on this kata's allowlist.` };
}

const preToolUseHook: HookCallback = async (input, _toolUseID, _ctx) => {
  if (input.hook_event_name !== "PreToolUse") return { continue: true };
  const summary = summarize(input.tool_name, input.tool_input);
  const { allow, reason } = decide(input.tool_name, input.tool_input);
  if (allow) {
    console.log(Colors.allow(`  ✓ allow  ${input.tool_name.padEnd(7)} ${summary}`));
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
      },
    };
  }
  console.log(Colors.deny(`  ✗ deny   ${input.tool_name.padEnd(7)} ${summary}  — ${reason}`));
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason!,
    },
  };
};

// ============================================================================
// Driver
// ============================================================================

async function run(options: Options, userPrompt: string) {
  console.log(Colors.user(`\nUser: ${userPrompt}`));
  console.log(Colors.tool("\n[PreToolUse log]"));
  const stream: AsyncIterable<SDKMessage> = query({ prompt: userPrompt, options });
  for await (const msg of stream) {
    if (msg.type === "assistant") {
      for (const b of msg.message.content) {
        if (b.type === "text" && b.text.trim()) {
          console.log(Colors.agent(`\nAgent: ${b.text}\n`));
        }
      }
    } else if (msg.type === "result" && msg.subtype === "success") {
      console.log(
        Colors.tool(
          `[done]   turns=${msg.num_turns} duration=${msg.duration_ms}ms cost=$${msg.total_cost_usd.toFixed(4)}`
        )
      );
    }
  }
}

async function main() {
  const useGate = !process.argv.includes("--no-gate");

  console.log(Colors.header("=".repeat(70)));
  console.log(Colors.header(" Kata SDK-01: Built-in agent loop + PreToolUse hook"));
  console.log(Colors.header("=".repeat(70)));
  console.log(
    `\nSample directory:  ${SAMPLE_DIR}\n` +
      `Permission gate:   ${useGate ? "ENABLED  (read-only PreToolUse hook)" : "DISABLED (--no-gate)"}\n` +
      `Custom tools:      none\n` +
      `Built-in tools:    Read, Glob, Grep, Bash, Write, Edit, … (preloaded by the SDK)\n`
  );

  // Notice what's NOT in options:
  //   - no mcpServers, no createSdkMcpServer, no tool() calls
  // The model already has Read/Glob/Grep/Bash/etc. We just point it at
  // the sample dir (additionalDirectories) and observe/gate via the hook.
  const options: Options = {
    model: "claude-sonnet-4-5",
    additionalDirectories: [SAMPLE_DIR],
    systemPrompt:
      "You are a code-archaeologist. When given a directory, explore it with " +
      "Glob/Grep/Read and report what you find. Be concise.",
    ...(useGate
      ? { hooks: { PreToolUse: [{ hooks: [preToolUseHook] }] } }
      : { permissionMode: "bypassPermissions" as const }),
  };

  // ----------------------------------------------------------------------
  // Demo 1 — exploration: the model finds the TODOs without any wired tools.
  // ----------------------------------------------------------------------
  await run(
    options,
    `In ${SAMPLE_DIR}, find every TODO and FIXME comment across all files. ` +
      `Group them by severity (security > correctness > performance > misc) ` +
      `and report them as a short bulleted list. Do not modify any file.`
  );

  // ----------------------------------------------------------------------
  // Demo 2 — mutation: ask for a Write. The gate should block it, and the
  // model should adapt. With --no-gate the file actually gets written
  // (and we delete it afterwards so re-runs are clean).
  // ----------------------------------------------------------------------
  console.log(Colors.header("\n" + "=".repeat(70)));
  console.log(Colors.header(" Demo 2: ask for a mutating action"));
  console.log(Colors.header("=".repeat(70)));

  const todosPath = resolve(SAMPLE_DIR, "TODOS.md");
  await run(
    options,
    `Write a file called ${todosPath} containing a one-line summary of every ` +
      `TODO and FIXME you can find in ${SAMPLE_DIR}. If you cannot write files, ` +
      `say so explicitly.`
  );

  if (!useGate && existsSync(todosPath)) {
    unlinkSync(todosPath);
    console.log(Colors.tool(`\n(cleaned up ${todosPath} so the next run starts fresh)`));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
