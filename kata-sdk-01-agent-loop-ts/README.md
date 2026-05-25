# Kata SDK-01: The built-in agent loop (TS, SDK-only)

**No Strands counterpart.** This kata exists to show what the Claude
Agent SDK gives you that Strands doesn't — and to make it observable.

## The point

Strands is a model-driven framework: you give an `Agent` some tools and
a model, and the model decides when to call them. If you don't supply
tools, the model has nothing to do.

The Claude Agent SDK is a *Claude-Code-as-a-library* framework: it
ships an agentic toolset preloaded. `Read`, `Glob`, `Grep`, `Bash`,
`Write`, `Edit`, `Task`, `WebFetch`, etc. are all there before you wire
anything. You can absolutely add custom MCP tools (see kata-03), but
the default agent already navigates filesystems and runs shell
commands. That's a different machine.

This kata gives the model a real task — *find every TODO/FIXME in
`sample/` and group them by severity* — and passes **zero custom
tools**. The model solves it by reaching for `Grep` and `Read`. You
watch it happen.

## The observation point: `PreToolUse` hook

Hooks fire on every tool call regardless of permission classification.
The kata installs one hook that does both jobs:

1. **Audit** — logs every tool the model tried, with the relevant args
2. **Gate** — returns `permissionDecision: 'deny'` for anything that
   would mutate state (Write/Edit/MultiEdit/NotebookEdit, plus any
   non-readonly Bash command)

```ts
const preToolUseHook: HookCallback = async (input) => {
  if (input.hook_event_name !== "PreToolUse") return { continue: true };
  const { allow, reason } = decide(input.tool_name, input.tool_input);
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: allow ? "allow" : "deny",
      permissionDecisionReason: reason,
    },
  };
};

const options: Options = {
  // notice: no mcpServers, no tool() calls — agent loop is preloaded
  additionalDirectories: [SAMPLE_DIR],
  hooks: { PreToolUse: [{ hooks: [preToolUseHook] }] },
};
```

## Why a hook and not `canUseTool`?

The SDK has two control points and they're not interchangeable:

| | `canUseTool` | `PreToolUse` hook |
|---|---|---|
| When it fires | Only when the SDK would otherwise prompt the user | Before *every* tool call |
| Sees safe-classified tools (`Read`, `Glob`, `Grep`) | No — they auto-pass | Yes |
| Intended for | Interactive UIs ("the user is in the loop") | Headless code ("the program is in the loop") |
| Verified empirically here | Doesn't fire on `Grep` in default mode | Fires on `Grep` every time |

In an earlier draft of this kata I used `canUseTool` and the audit log
stayed silent — the SDK auto-allowed all the read-only exploration.
`PreToolUse` is the right hammer when you want consistent observation.
`canUseTool` is what you'd plug into a chat UI's *"Approve this
command? [Y/n]"* flow.

## What you see when you run it

```
[PreToolUse log]
  ✓ allow  Grep    pattern="TODO|FIXME" path=...sample
Agent: Found 10 TODO/FIXME comments across 3 files. ...

Demo 2: ask for a mutating action
  ✓ allow  Grep    pattern="TODO" path=...sample
  ✓ allow  Grep    pattern="FIXME" path=...sample
  ✗ deny   Write   file_path=...TODOS.md  — Write is disabled — this kata is read-only.
Agent: I cannot write files — the Write tool is disabled in this read-only kata environment.
       However, I successfully found all TODOs and FIXMEs ...
```

The second demo is the key one — the model *plans* a Write, the hook
*denies* it, and the model *adapts* on the next turn, delivering the
content inline instead. That's the agentic loop you can't build in
Strands without re-implementing Read/Grep/Write/etc. yourself first.

## Setup

```bash
npm install
export ANTHROPIC_API_KEY="sk-ant-..."

npm start          # gate enabled (default)
npm run no-gate    # gate disabled — the bonus query actually writes TODOS.md
                   # (and the script deletes it after)
```

## Where this leads

- **kata-sdk-02** (next): subagents — the `Task` tool and `agents: {...}`
  let one agent delegate to specialists. Strands has no equivalent.
- **kata-sdk-03**: hooks beyond `PreToolUse` — `PostToolUse` for
  transforming results, `Stop` for enforcing final-state contracts.
