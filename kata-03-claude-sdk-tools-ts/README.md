# Kata 03: Claude Agent SDK with Custom Tools (TypeScript)

TypeScript port of [`kata-03-claude-sdk-tools`](../kata-03-claude-sdk-tools).
Same 8 tools, same two agent configurations, idiomatic TS.

## Setup

```bash
npm install
export ANTHROPIC_API_KEY="sk-ant-..."
npm start          # solution.ts
npm run starter    # starter.ts (TODOs)
```

Requires Node 18+ (for native `fetch`/`AbortSignal.timeout`) and the
Claude Code CLI on PATH.

## Differences from the Python kata-03

| Python | TypeScript |
|--------|------------|
| `@tool("name", "desc", {"city": str})` decorator | `tool("name", "desc", { city: z.string() }, handler)` factory — schema is a **zod raw shape**, not a dict |
| Handler is `async def(args: dict)` | Handler is `async (args) => ...` with **typed args inferred from the zod shape** |
| Result: `{"content": [{"type": "text", "text": "..."}]}` | Result: `{ content: [{ type: "text" as const, text: "..." }] }` (the `as const` keeps the discriminant) |
| `create_sdk_mcp_server("name", "1.0", [tools])` (positional) | `createSdkMcpServer({ name, version, tools })` (options bag) |
| `mcp_servers={...}, allowed_tools=[...]` | `mcpServers: { ... }, allowedTools: [...]` (camelCase) |
| `httpx.AsyncClient` | native `fetch()` with `AbortSignal.timeout(...)` |
| `eval(expr, {"__builtins__": {}}, safe)` | `Function("\"use strict\"; return (...)")()` after a regex char-allowlist |

## The zod-shape advantage

Because tool handlers infer their args from the zod shape, the TS port
gets argument-level type safety for free:

```ts
const convertTemperature = tool(
  "convert_temperature",
  "...",
  { value: z.number(), from_unit: z.enum(["C","F","K"]), to_unit: z.enum(["C","F","K"]) },
  async ({ value, from_unit, to_unit }) => {
    //        ^ number   ^ "C"|"F"|"K"  ^ "C"|"F"|"K"
    ...
  }
);
```

In Python the handler's `args` is `dict[str, Any]` and you cast as
needed — flexible, but no compile-time safety.

## Tool naming reminder

Custom MCP tools are addressed as:

    mcp__<server_name>__<tool_name>

So `createSdkMcpServer({ name: "workshop", ... })` + a tool named
`get_weather` becomes `mcp__workshop__get_weather` in `allowedTools`.
Same convention in Python.
