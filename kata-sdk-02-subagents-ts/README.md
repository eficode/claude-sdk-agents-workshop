# Kata SDK-02: Subagents (TS, SDK-only)

**No Strands counterpart.** Strands has no `Task` tool. Multi-agent
work in Strands means instantiating multiple `Agent` objects and
orchestrating them yourself; the model doesn't know there's a second
agent it could call.

## The point

The Claude Agent SDK ships a built-in `Task` tool (wire name: `Agent`).
You define subagents inline via `options.agents = { name: {...} }`, and
the coordinator's system prompt mentions when each one should be used.
The model then **decides on its own** when to dispatch a subagent and
synthesizes their replies.

Three things make this genuinely useful:

1. **Fresh context per subagent.** Each subagent gets its own
   conversation. Its tool calls and intermediate reasoning never
   reach the coordinator's context window. The coordinator only sees
   the subagent's final reply.
2. **Per-subagent tool restrictions.** Each `AgentDefinition` can
   declare `tools: [...]` — explicit allowlist. Pass `tools: []` for
   a tools-free pure-reasoning agent.
3. **Per-subagent model.** `model: "claude-haiku-4-5"` on a narrow
   subagent runs it cheaply while the coordinator stays on Sonnet.

## The scenario

Audit `./sample/` for tech debt. The coordinator (Sonnet) dispatches:

| Subagent | Tools | Model | Role |
|----------|-------|-------|------|
| `scanner` | `Grep`, `Glob`, `Read` | Haiku 4.5 | Locates every TODO/FIXME, returns a bullet list |
| `security-auditor` | `Read` only | inherits Sonnet | Reads ~10 lines around each security TODO and writes real risk notes (not just rehashing the TODO text) |
| `estimator` | **none** (`tools: []`) | inherits Sonnet | Estimates S/M/L effort from TODO text alone — pure LLM reasoning |

The coordinator's final job: stitch all three replies into a single
prioritized action list. The model decides the order. In practice it
runs `scanner` first (it needs the inventory), then dispatches
`security-auditor` and `estimator` in parallel.

## Making subagent output visible

By default, subagents produce a stream of internal messages
(`tool_use`, intermediate text, etc.) and only their **final** text
reply is fed back to the coordinator as a Task result. Those internal
messages *can* appear in your stream (with `subagent_type` set), but
the final reply has no special marker on the parent stream.

To watch each subagent's final reply, wire a `SubagentStop` hook —
its input carries `last_assistant_message`:

```ts
const subagentStopHook: HookCallback = async (input) => {
  if (input.hook_event_name !== "SubagentStop") return { continue: true };
  console.log(`[${input.agent_type} → coordinator]\n${input.last_assistant_message}`);
  return { continue: true };
};

const options: Options = {
  agents: { scanner, "security-auditor": securityAuditor, estimator },
  hooks: { SubagentStop: [{ hooks: [subagentStopHook] }] },
};
```

This is the same hook machinery from kata-sdk-01, just listening on a
different event. Hooks aren't only for tool gating.

## Verifying the per-subagent restrictions actually do something

The `ResultMessage` includes `modelUsage` — cost broken down per
model. On a real run you see something like:

```
[done]  turns=4  duration=65264ms  cost=$0.0971
        claude-haiku-4-5: $0.0091  in=6958 out=437   ← scanner
        claude-sonnet-4-5: $0.0874  in=1056 out=3625 ← coordinator + 2 subagents
```

Two confirmations bundled in:

- Haiku ran somewhere (it's not the coordinator) — that's the
  scanner subagent honoring its `model:` field.
- The cost per turn is split between the two models — coordinator
  isn't accidentally re-billing the subagent's work.

You can also confirm tool restrictions: in the run output you'll see
`[security-auditor] tool: Read(...)` but you should never see
`[security-auditor] tool: Grep(...)` — because its
`tools: ["Read"]` doesn't include Grep. Likewise the estimator emits
no tool calls at all.

## Run

```bash
npm install
export ANTHROPIC_API_KEY="sk-ant-..."
npm start
```

Expect ~60 seconds and ~$0.10. The coordinator runs Sonnet which
isn't cheap; if you want to dial the cost down, change the
coordinator's `model:` to `claude-haiku-4-5` too — the dispatch
behavior still works, just less eloquent synthesis.

## Where this differs from Strands

In Strands you'd write something like:

```python
scanner = Agent(model=..., tools=[grep_tool, read_tool])
auditor = Agent(model=..., tools=[read_tool])
estimator = Agent(model=..., tools=[])

def coordinate(directory):
    todos = scanner(f"find TODOs in {directory}")
    risks = auditor(f"assess these: {todos}")
    effort = estimator(f"size these: {todos}")
    return synthesize(todos, risks, effort)
```

You — the human — wrote `coordinate()` and decided the dispatch order
in Python. With the SDK, the *model* writes the equivalent of
`coordinate()` at runtime, against a fluid plan it adjusts as it
goes. That's the real difference, not just "they share a Task tool."
