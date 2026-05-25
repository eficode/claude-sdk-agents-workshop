# Kata SDK-03: Lifecycle hooks — UserPromptSubmit + PostToolUse + Stop

**No Strands counterpart.** Strands has no lifecycle event system —
to do any of what this kata shows, you'd intercept at the model
provider layer or wrap the agent in your own code.

## The point

The Claude Agent SDK fires hooks at every major point in the agent
loop. Earlier katas used one: kata-sdk-01 wired `PreToolUse` to gate
tools, kata-sdk-02 wired `SubagentStop` to surface subagent replies.
This kata combines **three different events doing genuinely different
work** in a single scenario, to show the events aren't interchangeable.

| Hook | Job | What it returns |
|------|-----|------------------|
| `UserPromptSubmit` | Inject context invisibly when a user submits a prompt | `additionalContext: string` |
| `PostToolUse` | Rewrite tool results before the model sees them | `updatedToolOutput: unknown` (native shape) |
| `Stop` | Veto end-of-turn; force model to revise | top-level `decision: "block"` + `reason` |

Each one does work the others can't:

- `PreToolUse` couldn't truncate a Read result — the tool hasn't run yet.
- `PostToolUse` couldn't change what the user typed — that already happened.
- A user-prompt rewriter can't enforce the final-answer shape — the
  model hasn't written it yet.
- The `Stop` hook *can't* observe tool args either — by the time it
  fires, all tools are done.

## The scenario

A deliberately vague prod alert:

> *"Something's weird with auth — investigate ./sample and tell me what's wrong."*

The user prompt mentions no severity scale, no required format, no
list of files to check. The three hooks each do one job to shape the
interaction:

### 1. `UserPromptSubmit` — policy injection

Every user prompt gets an extra operational policy paragraph attached
via `additionalContext`. The model sees the user's text and the
policy together as the turn's input.

```ts
return {
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext:
      "OPERATIONAL POLICY: This is a production codebase under incident response.\n" +
      "- You have read-only access.\n" +
      "- Never propose destructive actions (rm, drop, delete, force-push, etc.).\n" +
      "- Cite file:line for every finding so on-call can verify quickly.",
  },
};
```

Why a hook instead of just baking this into `systemPrompt`? Because
the policy text is **per-turn**: you can vary it based on the user's
identity, the time of day, recent events, what the user asked, etc.
A system prompt is static for the whole session.

### 2. `PostToolUse` — bounded outputs

The sample dir has a 122-line `access.log`. Without intervention,
reading it dumps 122 lines into the context window. The hook
intercepts the `Read` response, walks into `tool_response.file.content`,
truncates to 30 lines, and returns the rewritten response via
`updatedToolOutput`.

The hook handles three shapes the SDK actually emits:

```
Read tool:  { type: "text", file: { content: "<file body>" } }
Bash tool:  { stdout: "...", stderr: "...", interrupted, ... }
MCP tool:   { content: [{ type: "text", text: "..." }, ...] }
```

The truncation is rewritten **in the native shape** so the model
still sees a normal Read/Bash result — just shorter, with a
`[...truncated]` notice appended so it knows there's more.

#### The model can't game it

In a sample run the model tried this:

```
[tool_use] Read(.../access.log)
[PostToolUse] Read 123 lines  → truncated to 30
[tool_use] Read(.../access.log, "limit":130)   ← model trying to bypass
[PostToolUse] Read 123 lines  → truncated to 30
```

The Read tool's `limit` arg was set to 130 — but `PostToolUse` fires
*after* the tool runs, so the truncation still applied. This is the
key property of post-hooks: the model can adjust tool args but it
can't bypass the hook itself. Configuration in `systemPrompt` or
tool definitions *can* be argued with; a hook with `updatedToolOutput`
cannot.

### 3. `Stop` — final-shape enforcement

The system prompt doesn't tell the model what format to use. Yet the
final answer must contain literal `## Severity:` and `## Findings:`
markdown headers. The Stop hook checks the last assistant message
and returns `decision: "block"` with a reason if either header is
missing:

```ts
return {
  decision: "block",
  reason:
    `Your reply is missing required sections: ${missing.join(" and ")}.\n` +
    "Revise your previous answer so it includes EXACTLY those markdown headers " +
    "(literal '## Severity:' and '## Findings:'). Do not write a new investigation " +
    "— just restructure what you already found.",
};
```

The block message goes back to the model as the reason it must
continue. It revises and tries to stop again. The second time, the
sections are there, the hook approves.

#### Loop protection

Without care, `decision: "block"` could spin forever — every Stop is
followed by another Stop. The hook input includes
`stop_hook_active: boolean` which is `true` if a Stop hook has
already fired on this attempt. **Always check it and pass through if
set**:

```ts
if (input.stop_hook_active) {
  console.log("[Stop] stop_hook_active=true — giving up gracefully");
  return { continue: true };
}
```

In a sample run the model succeeded on the first revision and Stop
approved. The fallback exists for cases where the model can't
satisfy the requirement and we'd rather ship a degraded reply than
infinite-loop.

## What the live run shows

```
[UserPromptSubmit]
  original prompt → "Something's weird with auth — investigate ..."
  injected:         policy preamble (286 chars)

[tool_use] Bash(ls -la sample)
[PostToolUse] Bash       7 lines  → passthrough
[tool_use] Read(auth.py)
[PostToolUse] Read      17 lines  → passthrough
[tool_use] Read(access.log)
[PostToolUse] Read     123 lines  → truncated to 30
[tool_use] Read(access.log, limit:130)        ← bypass attempt
[PostToolUse] Read     123 lines  → truncated to 30
... model writes report without ## Severity: / ## Findings: headers ...
[Stop] BLOCK      missing: ## Severity:, ## Findings: — sending back for revision
... model rewrites with required headers ...
[Stop]            stop_hook_active=true — giving up gracefully
[done]  turns=10  duration=53481ms  cost=$0.0954
```

`turns=10` instead of the more typical 2–4: the Stop block forces an
extra round-trip through the model. That's the cost of enforcement;
worth it when the downstream consumer expects a specific shape.

## Run

```bash
npm install
export ANTHROPIC_API_KEY="sk-ant-..."

npm start          # hooks enabled
npm run no-hooks   # contrast — same vague prompt, no enforcement
```

In `--no-hooks` mode the response is still good but its shape is
whatever the model felt like producing — usually a long unstructured
markdown blob. With hooks enabled it's a deterministic
`## Severity: ... ## Findings: ...` shape that downstream tooling can parse.

## Hook callbacks: a single function for many events

Every hook callback has the same TypeScript signature:

```ts
type HookCallback = (
  input: HookInput,            // discriminated union over event types
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
) => Promise<HookJSONOutput>;
```

`input.hook_event_name` is the discriminator. The pattern in this
kata's three hooks is the same:

```ts
const myHook: HookCallback = async (input) => {
  if (input.hook_event_name !== "SomeEvent") return { continue: true };
  // TypeScript now narrows `input` to the event-specific type.
  ...
};
```

Always check the event name first. The same callback can theoretically
be registered on multiple events, but in practice it's clearer to
keep one callback per event.
