/**
 * Kata 02: Claude Agent SDK Introduction (TypeScript) — Solution
 *
 * TypeScript port of kata-02. Same demos as solution.py.
 *
 * Prerequisites:
 *   npm install
 *   export ANTHROPIC_API_KEY="sk-ant-..."
 *   npm start
 */

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";

const DEFAULT_MODEL = "claude-haiku-4-5";
const COMPARISON_MODEL = "claude-sonnet-4-5";

const MODEL_PRICING: Record<string, { input: number; output: number; name: string }> = {
  "claude-sonnet-4-5": { input: 3.0, output: 15.0, name: "Sonnet 4.5" },
  "claude-haiku-4-5": { input: 0.8, output: 4.0, name: "Haiku 4.5" },
};

const Colors = {
  HEADER: "\x1b[1;96m",
  PROMPT: "\x1b[93m",
  RESPONSE: "\x1b[92m",
  STATS: "\x1b[95m",
  RESET: "\x1b[0m",
  header: (s: string) => `\x1b[1;96m${s}\x1b[0m`,
  prompt: (s: string) => `\x1b[93m${s}\x1b[0m`,
  response: (s: string) => `\x1b[92m${s}\x1b[0m`,
  stats: (s: string) => `\x1b[95m${s}\x1b[0m`,
};

function baseOptions(overrides: Partial<Options> = {}): Options {
  // allowedTools=[] + tools=[] keeps this kata purely conversational —
  // the SDK won't auto-grant Read/Write/Bash/Glob/Grep/etc.
  return {
    model: DEFAULT_MODEL,
    allowedTools: [],
    ...overrides,
  };
}

/**
 * Drain a query() stream into the final text response + the session id
 * (so a follow-up turn can resume the same conversation).
 */
async function collect(
  stream: AsyncIterable<SDKMessage>
): Promise<{ text: string; sessionId: string | null; result?: Extract<SDKMessage, { type: "result" }> }> {
  const parts: string[] = [];
  let sessionId: string | null = null;
  let result: Extract<SDKMessage, { type: "result" }> | undefined;

  for await (const msg of stream) {
    if (msg.type === "assistant") {
      sessionId = msg.session_id;
      for (const block of msg.message.content) {
        if (block.type === "text") parts.push(block.text);
      }
    } else if (msg.type === "result") {
      result = msg;
      sessionId = msg.session_id;
    }
  }
  return { text: parts.join(""), sessionId, result };
}

// ===========================================================================
// Demo 1 — one-shot query
// ===========================================================================
async function demoBasicQuery() {
  console.log(Colors.header("\n1. Basic one-shot query"));
  console.log("-".repeat(40));
  const userPrompt = "What is the capital of France? Answer briefly.";
  console.log(Colors.prompt(`User: ${userPrompt}`));

  const { text } = await collect(query({ prompt: userPrompt, options: baseOptions() }));
  console.log(Colors.response(`Agent: ${text}`));
}

// ===========================================================================
// Demo 2 — system prompt changes tone
// ===========================================================================
async function demoSystemPrompt() {
  console.log(Colors.header("\n2. Custom system prompt (weather assistant)"));
  console.log("-".repeat(40));

  const options = baseOptions({
    systemPrompt:
      "You are a friendly weather assistant. " +
      "Explain weather phenomena in simple terms with everyday analogies. " +
      "Be concise.",
  });
  const userPrompt = "Why is the sky blue?";
  console.log(Colors.stats("System: 'You are a friendly weather assistant...'"));
  console.log(Colors.prompt(`User: ${userPrompt}`));

  const { text } = await collect(query({ prompt: userPrompt, options }));
  console.log(Colors.response(`Weather Agent: ${text}`));
}

// ===========================================================================
// Demo 3 — multi-turn via resume: session_id
// ===========================================================================
// Strands keeps history on the Agent instance; Python SDK has ClaudeSDKClient.
// The TS SDK doesn't ship a session-client class — instead, every message
// carries a session_id, and you continue a session by passing
// `resume: <session_id>` on the next query() call.
async function demoMultiTurn() {
  console.log(Colors.header("\n3. Multi-turn conversation (resume: session_id)"));
  console.log("-".repeat(40));

  const first = "My name is Alice and I study meteorology at university.";
  console.log(Colors.prompt(`User: ${first}`));
  const turn1 = await collect(query({ prompt: first, options: baseOptions() }));
  console.log(Colors.response(`Agent: ${turn1.text}`));

  if (!turn1.sessionId) {
    console.log("Could not extract session_id — multi-turn skipped.");
    return;
  }

  const second = "What's my name and what do I study?";
  console.log(Colors.prompt(`\nUser: ${second}`));
  const turn2 = await collect(
    query({ prompt: second, options: baseOptions({ resume: turn1.sessionId }) })
  );
  console.log(Colors.response(`Agent: ${turn2.text}`));
}

// ===========================================================================
// Demo 4 — specialized WeatherBot
// ===========================================================================
async function demoWeatherChatbot() {
  console.log(Colors.header("\n4. Specialized WeatherBot"));
  console.log("-".repeat(40));

  const options = baseOptions({
    systemPrompt:
      "You are WeatherBot, an expert weather assistant.\n\n" +
      "Capabilities: explain weather phenomena, describe cloud types, " +
      "explain forecasting, discuss climate patterns.\n\n" +
      "Style: friendly, simple language, practical examples, concise.\n\n" +
      "You do not have real-time weather access — explain concepts only.",
  });

  const questions = ["What are cumulonimbus clouds?", "How do meteorologists predict weather?"];
  for (const q of questions) {
    console.log(Colors.prompt(`\nUser: ${q}`));
    const { text } = await collect(query({ prompt: q, options }));
    console.log(Colors.response(`WeatherBot: ${text}`));
  }
}

// ===========================================================================
// Demo 5 — Haiku vs Sonnet via the raw Anthropic SDK
// ===========================================================================
// Same rationale as the Python version: token counts from the raw API are
// apples-to-apples, the SDK's ResultMessage includes Claude Code framing.
async function compareModels(prompt: string) {
  const client = new Anthropic();
  const results: Record<
    string,
    { name: string; response: string; time: number; inputTokens: number; outputTokens: number; cost: number }
  > = {};

  for (const modelId of [DEFAULT_MODEL, COMPARISON_MODEL]) {
    const start = Date.now();
    const response = await client.messages.create({
      model: modelId,
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });
    const elapsed = (Date.now() - start) / 1000;
    const pricing = MODEL_PRICING[modelId];
    const cost =
      (response.usage.input_tokens * pricing.input) / 1_000_000 +
      (response.usage.output_tokens * pricing.output) / 1_000_000;
    const firstBlock = response.content[0];
    const text = firstBlock.type === "text" ? firstBlock.text : "";
    results[modelId] = {
      name: pricing.name,
      response: text,
      time: elapsed,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost,
    };
  }
  return results;
}

function printComparisonTable(results: Awaited<ReturnType<typeof compareModels>>) {
  const bar = "─".repeat(58);
  console.log(Colors.header(`\n┌${bar}┐`));
  console.log(Colors.header(`│${" MODEL COMPARISON SUMMARY".padStart(35).padEnd(58)}│`));
  console.log(
    Colors.header(`├${"─".repeat(12)}┬${"─".repeat(10)}┬${"─".repeat(10)}┬${"─".repeat(10)}┬${"─".repeat(12)}┤`)
  );
  console.log(
    Colors.header(`│${"Model".padStart(8).padEnd(12)}│${"Time".padStart(6).padEnd(10)}│${"In Tok".padStart(7).padEnd(10)}│${"Out Tok".padStart(8).padEnd(10)}│${"Cost".padStart(7).padEnd(12)}│`)
  );
  console.log(
    Colors.header(`├${"─".repeat(12)}┼${"─".repeat(10)}┼${"─".repeat(10)}┼${"─".repeat(10)}┼${"─".repeat(12)}┤`)
  );
  for (const data of Object.values(results)) {
    const row =
      `│${data.name.padEnd(12)}` +
      `│${(data.time.toFixed(2) + "s").padEnd(10)}` +
      `│${String(data.inputTokens).padEnd(10)}` +
      `│${String(data.outputTokens).padEnd(10)}` +
      `│${("$" + data.cost.toFixed(6)).padEnd(12)}│`;
    console.log(Colors.stats(row));
  }
  console.log(
    Colors.header(`└${"─".repeat(12)}┴${"─".repeat(10)}┴${"─".repeat(10)}┴${"─".repeat(10)}┴${"─".repeat(12)}┘`)
  );

  const haiku = results[DEFAULT_MODEL];
  const sonnet = results[COMPARISON_MODEL];
  if (haiku && sonnet) {
    if (haiku.time > 0) console.log(Colors.stats(`\n  Haiku is ~${(sonnet.time / haiku.time).toFixed(1)}x faster than Sonnet`));
    if (haiku.cost > 0) console.log(Colors.stats(`  Haiku is ~${(sonnet.cost / haiku.cost).toFixed(1)}x cheaper than Sonnet`));
  }
}

async function demoModelComparison() {
  console.log(Colors.header("\n5. Model comparison (Haiku vs Sonnet)"));
  console.log("-".repeat(40));
  const prompt = "Explain what causes thunder in one sentence.";
  console.log(Colors.prompt(`Prompt: '${prompt}'`));
  console.log(Colors.stats("\nRunning same prompt on Haiku and Sonnet via raw Anthropic API..."));

  const results = await compareModels(prompt);
  for (const data of Object.values(results)) {
    console.log(Colors.stats(`\n${data.name} (${data.time.toFixed(2)}s):`));
    console.log(Colors.response(`  ${data.response}`));
  }
  printComparisonTable(results);
}

// ===========================================================================
// Demo 6 — inspect ResultMessage from the SDK
// ===========================================================================
async function demoResultMessage() {
  console.log(Colors.header("\n6. Bonus: inspecting ResultMessage"));
  console.log("-".repeat(40));
  console.log(Colors.stats("Each SDK turn ends with a 'result' message — duration, cost, usage."));

  const { text, result } = await collect(query({ prompt: "Say hi in five words.", options: baseOptions() }));
  console.log(Colors.response(`Agent: ${text}`));
  if (result && result.subtype === "success") {
    console.log(
      Colors.stats(
        `  duration=${result.duration_ms}ms cost=$${result.total_cost_usd.toFixed(6)} turns=${result.num_turns}`
      )
    );
  }
}

// ===========================================================================
// Entrypoint
// ===========================================================================
async function main() {
  console.log(Colors.header("=".repeat(70)));
  console.log(Colors.header(" Kata 02: Claude Agent SDK Introduction (TS) — Solution"));
  console.log(Colors.header("=".repeat(70)));

  await demoBasicQuery();
  await demoSystemPrompt();
  await demoMultiTurn();
  await demoWeatherChatbot();
  await demoModelComparison();
  await demoResultMessage();

  console.log(Colors.header("\n" + "=".repeat(70)));
  console.log(Colors.header(" Kata 02 Complete!"));
  console.log(Colors.header("=".repeat(70)));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
