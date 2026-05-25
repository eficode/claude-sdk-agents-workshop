# Kata 03: Claude Agent SDK with Custom Tools (Python)

Port of [`kata-03-strands-tools`](https://github.com/ahokaju/local-ai-agents-workshop/tree/main/kata-03-strands-tools).

## Objective

Give the agent custom tools — real Python functions it can call mid-turn
to fetch live data, do math, look things up. This is where the SDK's
model diverges most from Strands.

## The big shift vs. Strands

In Strands, `@tool` decorates a plain Python function and you pass the
list to `Agent(tools=[...])`. The agent calls those functions directly.

In the Claude Agent SDK, **custom tools live inside an in-process MCP
server**. The SDK creates one for you with `create_sdk_mcp_server(...)`,
runs it in your Python process (no subprocess, no IPC overhead), and the
agent reaches the tools over the MCP protocol.

You also have to **allowlist tool names explicitly** in
`ClaudeAgentOptions.allowed_tools` using the convention:

    mcp__<server_name>__<tool_name>

Without that allowlist the agent can see the tools but can't call them
without prompting for permission.

```python
@tool("get_weather", "Get weather for a city.", {"city": str})
async def get_weather(args):
    ...
    return {"content": [{"type": "text", "text": "..."}]}

server = create_sdk_mcp_server("workshop", "1.0.0", [get_weather, ...])

options = ClaudeAgentOptions(
    model="claude-haiku-4-5",
    system_prompt="...",
    mcp_servers={"workshop": server},
    allowed_tools=["mcp__workshop__get_weather", ...],
)
```

## Differences worth knowing

| Strands | Claude Agent SDK |
|---------|------------------|
| `@tool` from `strands` | `@tool` from `claude_agent_sdk` (same name, different signature) |
| Tool fn is sync, returns `str` | Tool fn is `async`, returns `{"content": [{"type": "text", "text": ...}]}` |
| Schema inferred from type hints + docstring | Schema is an explicit `{"arg_name": type}` dict (or full JSON Schema / TypedDict) |
| `Agent(tools=[...])` is enough | Need server + `mcp_servers={...}` + `allowed_tools=[...]` |
| Tool errors raise to caller | Return error text in the result block — the model sees it as the tool's reply |

## Tools in this kata

Same eight as the Strands version: `get_weather`, `calculate`,
`get_current_time`, `convert_temperature`, `generate_random_number`,
`get_city_info`, `fetch_webpage`, `get_webpage_title`.

Two agent configurations:

- **General agent** with all eight tools allowlisted
- **Specialized WeatherBot** with only `get_weather`,
  `convert_temperature`, `get_city_info` — demonstrates the allowlist
  doing real restriction work

## Run

```bash
python solution.py    # full demo
python starter.py     # try the TODOs first
```

## Reading the output

The `run()` helper prints two things per query:

- `Agent: <text>` — the model's prose response
- `  → tool: <name>(<args>)` — every tool call the model made

So a query like *"Weather in London and Helsinki, which is colder?"*
produces two `get_weather` tool-call lines before the final answer.

## What to try next

- Add a new tool and allowlist it. Confirm forgetting the allowlist
  entry causes the model to ask for permission.
- Swap the schema dict for a `TypedDict` class to see richer arg shapes.
- Add `disallowed_tools=["mcp__workshop__fetch_webpage"]` on top of the
  full allowlist — should override and block that one tool.
