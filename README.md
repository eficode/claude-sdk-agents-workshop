# Claude Agent SDK Katas

A port of the [local-ai-agents-workshop](../local-ai-agents-workshop) katas from the
**Strands Agents SDK** to the **Claude Agent SDK** — Anthropic's own SDK for
building Claude Code-style agents in Python.

## Why this exists

The original workshop teaches agents via Strands. The Claude Agent SDK is
Anthropic's first-party alternative — it ships the same loop that powers
Claude Code, with built-in tools (Read/Write/Bash/etc.), MCP support, and
session management. These katas are the same exercises, ported one by one.

## Status

| Kata | Original (Strands, Python) | This repo — Python | This repo — TypeScript |
|------|---------------------------|--------------------|-----------------------|
| 02 — Agents Intro | ✅ | ✅ ported | ✅ ported |
| 03 — Custom Tools | ✅ | ✅ ported | ✅ ported |
| 04 — Local RAG | ✅ | not started | not started |

### SDK-only katas (no Strands counterpart)

These exercises show capabilities the Claude Agent SDK ships that
Strands has no equivalent for. TypeScript only by request.

| Kata | What it shows | Status |
|------|----------------|--------|
| **sdk-01 — Agent loop + PreToolUse hook** | The SDK's built-in agent tools (Read/Glob/Grep/Bash/...) used with zero custom tools, observed and gated by a hook | ✅ ported |
| **sdk-02 — Subagents** | Task tool + `agents: {...}` definitions, multi-agent composition | ⏳ next |
| **sdk-03 — Lifecycle hooks** | PostToolUse / Stop / UserPromptSubmit beyond the basic PreToolUse case | ⏳ later |
| ...  | | | |

## Setup

### Python

```bash
# Python 3.10+ required by claude-agent-sdk
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
export ANTHROPIC_API_KEY="sk-ant-..."
python kata-02-claude-sdk-intro/solution.py
```

### TypeScript

```bash
cd kata-02-claude-sdk-intro-ts
npm install
export ANTHROPIC_API_KEY="sk-ant-..."
npm start
```

Both flavors require the Claude Code CLI (`claude` on PATH) — the SDK
shells out to it.

## Mapping from Strands

| Strands concept | Claude Agent SDK equivalent |
|-----------------|-----------------------------|
| `Agent(model=..., system_prompt=...)` | `ClaudeAgentOptions(model=..., system_prompt=...)` |
| `agent("hello")` (one-shot) | `query(prompt="hello", options=...)` |
| `agent("...")` (multi-turn, same instance) | `ClaudeSDKClient(options=...)` session |
| `@tool` decorated Python function | `@tool` + in-process MCP server (`create_sdk_mcp_server`) |
| `tools=[...]` on the Agent | `mcp_servers={...}` + `allowed_tools=[...]` in options |
| Strands tool registry | MCP protocol (also works with external MCP servers) |

The biggest mental shift: Claude Agent SDK is agent-loop-first. Its default
toolset is `Read`/`Write`/`Bash`/`Glob`/`Grep`/etc. For purely conversational
katas we explicitly pass `allowed_tools=[]` to keep the model from reaching
for the filesystem.
