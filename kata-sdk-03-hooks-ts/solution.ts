/**
 * Kata SDK-03: Lifecycle hooks (UserPromptSubmit + PostToolUse + Stop)
 *
 * What this kata shows that Strands CANNOT do out of the box:
 *
 *   The SDK exposes the agent loop as a sequence of events you can hook
 *   into. Each event has its own job and its own output shape. This
 *   kata wires three hooks doing genuinely different work in one
 *   coherent scenario:
 *
 *     UserPromptSubmit  → inject policy context with the user prompt
 *     PostToolUse       → bound noisy tool outputs (truncate)
 *     Stop              → enforce final-response shape (block + retry)
 *
 *   None of this is "intercepting requests in middleware" — the model
 *   genuinely reacts to each hook. A blocked Stop re-enters the loop
 *   and the model revises its reply.
 *
 * Scenario: a deliberately vague prod incident ("something's weird
 * with auth — investigate"). The agent reads ./sample/ which has both
 * a small auth.py (passes the truncator untouched) and a 122-line
 * access.log (gets aggressively truncated). The Stop hook then
 * insists the answer has "## Severity:" and "## Findings:" headers.
 *
 * Run:
 *   npm install
 *   export ANTHROPIC_API_KEY="sk-ant-..."
 *   npm start              # hooks enabled (default)
 *   npm run no-hooks       # contrast — no hooks, see how the response shape drifts
 */

import "dotenv/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
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
  hook: (s: string) => `\x1b[35m${s}\x1b[0m`,
  block: (s: string) => `\x1b[31m${s}\x1b[0m`,
  meta: (s: string) => `\x1b[90m${s}\x1b[0m`,
};

// ============================================================================
// Hook 1 — UserPromptSubmit: inject policy context with every prompt
// ============================================================================
// The user types a casual sentence. We invisibly attach an operational
// policy alongside it via `additionalContext`. The model sees both.
// This is how you bake "guardrails" into a deployment without trusting
// the user to remember to include them in every prompt.

const userPromptSubmitHook: HookCallback = async (input) => {
  if (input.hook_event_name !== "UserPromptSubmit") return { continue: true };
  console.log(Colors.hook(`\n[UserPromptSubmit]`));
  console.log(Colors.hook(`  original prompt → "${input.prompt.slice(0, 80)}..."`));
  const policy =
    "OPERATIONAL POLICY: This is a production codebase under incident response.\n" +
    "- You have read-only access.\n" +
    "- Never propose destructive actions (rm, drop, delete, force-push, etc.).\n" +
    "- Cite file:line for every finding so on-call can verify quickly.";
  console.log(Colors.hook(`  injected:         policy preamble (${policy.length} chars)`));
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: policy,
    },
  };
};

// ============================================================================
// Hook 2 — PostToolUse: truncate noisy tool outputs
// ============================================================================
// Reading a 5000-line log into the context window is expensive and
// usually wastes tokens; the model rarely needs more than the first
// page. We intercept Read/Bash outputs, count lines, and truncate
// in the NATIVE response shape (so the model still sees a normal
// Read/Bash result, just shorter).

const MAX_LINES = 30;

function truncateText(text: string): { text: string; original: number; kept: number } {
  const lines = text.split("\n");
  if (lines.length <= MAX_LINES) return { text, original: lines.length, kept: lines.length };
  const kept = lines.slice(0, MAX_LINES).join("\n");
  return {
    text: `${kept}\n\n[...truncated by PostToolUse hook: ${lines.length - MAX_LINES} more lines hidden]`,
    original: lines.length,
    kept: MAX_LINES,
  };
}

const postToolUseHook: HookCallback = async (input) => {
  if (input.hook_event_name !== "PostToolUse") return { continue: true };
  const resp = input.tool_response as Record<string, unknown> | undefined;
  if (!resp) return { continue: true };

  // Three shapes we know how to mutate. Anything else: passthrough.
  //   Read: { type: "text", file: { content: string, ... } }
  //   Bash: { stdout: string, stderr: string, ... }
  //   MCP-ish: { content: [{ type: "text", text: string }, ...] }
  let kind: "read" | "bash" | "mcp" | null = null;
  let originalText = "";

  if (resp.file && typeof (resp.file as Record<string, unknown>).content === "string") {
    kind = "read";
    originalText = (resp.file as Record<string, unknown>).content as string;
  } else if (typeof resp.stdout === "string") {
    kind = "bash";
    originalText = resp.stdout as string;
  } else if (Array.isArray(resp.content)) {
    kind = "mcp";
    originalText = (resp.content as Array<Record<string, unknown>>)
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string)
      .join("\n");
  } else {
    return { continue: true };
  }

  const { text: newText, original, kept } = truncateText(originalText);
  if (kept === original) {
    console.log(Colors.hook(`[PostToolUse] ${input.tool_name.padEnd(7)} ${original.toString().padStart(4)} lines  → passthrough`));
    return { continue: true };
  }

  console.log(
    Colors.hook(
      `[PostToolUse] ${input.tool_name.padEnd(7)} ${original.toString().padStart(4)} lines  → truncated to ${kept}`
    )
  );

  // Rewrite the response in its native shape.
  let updated: unknown;
  if (kind === "read") {
    updated = { ...resp, file: { ...(resp.file as object), content: newText } };
  } else if (kind === "bash") {
    updated = { ...resp, stdout: newText };
  } else {
    updated = { ...resp, content: [{ type: "text", text: newText }] };
  }

  return {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      updatedToolOutput: updated,
    },
  };
};

// ============================================================================
// Hook 3 — Stop: enforce response shape
// ============================================================================
// The model wants to stop. We veto unless its reply contains the
// required headers. The block message goes back to the model as the
// reason it MUST continue working — it'll revise the reply and try
// to stop again. `stop_hook_active` prevents an infinite loop: if
// we've already blocked once on this attempt, give up gracefully.

const REQUIRED_SECTIONS = [
  { name: "## Severity:", regex: /^##\s*Severity\b/im },
  { name: "## Findings:", regex: /^##\s*Findings\b/im },
];

const stopHook: HookCallback = async (input) => {
  if (input.hook_event_name !== "Stop") return { continue: true };
  if (input.stop_hook_active) {
    console.log(Colors.hook(`[Stop]            stop_hook_active=true — giving up gracefully`));
    return { continue: true };
  }
  const last = input.last_assistant_message ?? "";
  const missing = REQUIRED_SECTIONS.filter((s) => !s.regex.test(last)).map((s) => s.name);
  if (missing.length === 0) {
    console.log(Colors.hook(`[Stop]            all required sections present → approve`));
    return { continue: true };
  }
  console.log(Colors.block(`[Stop] BLOCK      missing: ${missing.join(", ")} — sending back for revision`));
  return {
    decision: "block",
    reason:
      `Your reply is missing required sections: ${missing.join(" and ")}.\n` +
      "Revise your previous answer so it includes EXACTLY those markdown headers (literal '## Severity:' and '## Findings:'). " +
      "Do not write a new investigation — just restructure what you already found.",
  };
};

// ============================================================================
// Driver
// ============================================================================

async function run(options: Options, userPrompt: string) {
  console.log(Colors.user(`\nUser: ${userPrompt}\n`));
  const stream: AsyncIterable<SDKMessage> = query({ prompt: userPrompt, options });

  for await (const msg of stream) {
    if (msg.type === "assistant") {
      for (const b of msg.message.content) {
        if (b.type === "text" && b.text.trim()) {
          console.log(Colors.agent(`\n[assistant]\n${b.text}\n`));
        } else if (b.type === "tool_use") {
          const args = JSON.stringify(b.input).slice(0, 140);
          console.log(Colors.tool(`[tool_use] ${b.name}(${args})`));
        }
      }
    } else if (msg.type === "result" && msg.subtype === "success") {
      console.log(
        Colors.meta(
          `\n[done]  turns=${msg.num_turns}  duration=${msg.duration_ms}ms  cost=$${msg.total_cost_usd.toFixed(4)}`
        )
      );
    }
  }
}

async function main() {
  const useHooks = !process.argv.includes("--no-hooks");

  console.log(Colors.header("=".repeat(70)));
  console.log(Colors.header(" Kata SDK-03: UserPromptSubmit + PostToolUse + Stop hooks"));
  console.log(Colors.header("=".repeat(70)));
  console.log(
    `\nSample directory: ${SAMPLE_DIR}\n` +
      `Hooks:            ${useHooks ? "ENABLED" : "DISABLED (--no-hooks)"}\n`
  );

  const options: Options = {
    model: "claude-sonnet-4-5",
    additionalDirectories: [SAMPLE_DIR],
    permissionMode: "bypassPermissions",
    systemPrompt:
      "You are an incident-triage assistant. When asked to investigate, use Read/Grep/Bash to " +
      "explore the codebase and produce a concise report.",
    ...(useHooks && {
      hooks: {
        UserPromptSubmit: [{ hooks: [userPromptSubmitHook] }],
        PostToolUse: [{ hooks: [postToolUseHook] }],
        Stop: [{ hooks: [stopHook] }],
      },
    }),
  };

  // Deliberately vague — no mention of severity levels, no required
  // format, no checklist of what to look at. The whole point is that
  // the three hooks shape the interaction without modifying this prompt.
  await run(options, `Something's weird with auth — investigate ${SAMPLE_DIR} and tell me what's wrong.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
