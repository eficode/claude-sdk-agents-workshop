# Kata 02: Introduction to the Claude Agent SDK (TypeScript)

TypeScript port of [`kata-02-claude-sdk-intro`](../kata-02-claude-sdk-intro).
Same demos, same learning goals, idiomatic TS.

## Setup

```bash
npm install
export ANTHROPIC_API_KEY="sk-ant-..."   # or use a logged-in `claude` CLI
npm start          # runs solution.ts
npm run starter    # runs starter.ts (TODOs)
```

Requires Node 18+ and the Claude Code CLI on PATH (`claude` — the SDK
shells out to it). The kata authenticates either via `ANTHROPIC_API_KEY`
or whatever credentials the `claude` CLI is already logged in with.

## What's different from the Python version

The Python and TS SDKs cover the same surface area but expose it
differently. The key shifts to know:

| Concept | Python | TypeScript |
|---------|--------|------------|
| One-shot query | `query(prompt=..., options=...)` (async iterator) | `query({ prompt, options })` (async iterable) |
| Options field naming | `snake_case` (`system_prompt`, `allowed_tools`) | `camelCase` (`systemPrompt`, `allowedTools`) |
| Multi-turn session | `ClaudeSDKClient` context manager | No client class — pass `resume: <session_id>` to next `query()` |
| Message types | `AssistantMessage`, `TextBlock` classes | Discriminated union — check `msg.type === 'assistant'` then iterate `msg.message.content` |
| Async runtime | `asyncio.run(main())` | `main().catch(...)` |

### Multi-turn pattern

Strands keeps a stateful `Agent` instance. The Python SDK wraps that in
`ClaudeSDKClient`. The TS SDK doesn't ship a client class at all —
instead, every message carries a `session_id`, and you continue a
conversation by passing it back:

```ts
const turn1 = await collect(query({ prompt: "Hi, I'm Alice.", options }));
const turn2 = await collect(
  query({ prompt: "What's my name?", options: { ...options, resume: turn1.sessionId } })
);
// turn2.text references Alice
```

This is also how you'd resume a conversation across process restarts —
persist `sessionId` somewhere and pass it back later.

### Extracting text from the stream

The TS SDK yields a discriminated union. Pattern:

```ts
for await (const msg of query({ prompt, options })) {
  if (msg.type === "assistant") {
    for (const block of msg.message.content) {
      if (block.type === "text") console.log(block.text);
    }
  } else if (msg.type === "result" && msg.subtype === "success") {
    console.log(`cost=${msg.total_cost_usd}`);
  }
}
```

Python's `isinstance(msg, AssistantMessage)` becomes
`msg.type === "assistant"`, and the inner content blocks are typed the
same way.

### Disabling built-in tools

Same idea as Python — `allowedTools: []` keeps the model from
auto-using Read/Write/Bash/etc., so the kata stays purely
conversational.

## Files

- `solution.ts` — full reference implementation, all 6 demos
- `starter.ts` — TODOs for demos 1–3
- `package.json` — `start` and `starter` scripts via `tsx`
- `tsconfig.json` — ES modules, strict mode
