"""
Kata 03: Claude Agent SDK with Custom Tools — Starter

Fill in the TODOs to build an agent that calls your custom tools.

The shape:
    1. Decorate async functions with @tool(name, description, schema).
    2. Wrap them in an MCP server with create_sdk_mcp_server(...).
    3. Reference the server in ClaudeAgentOptions(mcp_servers={...}).
    4. Allowlist tools with allowed_tools=["mcp__<server>__<tool>", ...].
"""

import asyncio
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    TextBlock,
    ToolUseBlock,
    create_sdk_mcp_server,
    query,
    tool,
)

load_dotenv()


def text_result(s: str) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": s}]}


# -----------------------------------------------------------------------------
# TODO 1: define a `get_current_time` tool
# -----------------------------------------------------------------------------
# Use the @tool(name, description, schema) decorator. Schema is a dict
# mapping arg name to type (e.g. {"tz_name": str}). The async function
# receives `args: dict` and must return text_result(...).
@tool("get_current_time", "TODO description", {"tz_name": str})
async def get_current_time(args: dict[str, Any]) -> dict[str, Any]:
    raise NotImplementedError("TODO 1: implement get_current_time")


# -----------------------------------------------------------------------------
# TODO 2: define a `calculate` tool
# -----------------------------------------------------------------------------
# Accept an expression string and return its evaluated value. Use a
# restricted eval (no __builtins__) — see solution.py for the safe-eval
# pattern.
@tool("calculate", "TODO description", {"expression": str})
async def calculate(args: dict[str, Any]) -> dict[str, Any]:
    raise NotImplementedError("TODO 2: implement calculate")


# -----------------------------------------------------------------------------
# TODO 3: wire up the MCP server and options
# -----------------------------------------------------------------------------
# - Build server = create_sdk_mcp_server("workshop", "1.0.0", [tools...])
# - In options, set:
#     mcp_servers={"workshop": server}
#     allowed_tools=["mcp__workshop__get_current_time", "mcp__workshop__calculate"]
def build_options() -> ClaudeAgentOptions:
    raise NotImplementedError("TODO 3: build options with MCP server + allowed_tools")


# -----------------------------------------------------------------------------
# TODO 4: run a query and print both text and tool calls
# -----------------------------------------------------------------------------
async def run(prompt: str) -> None:
    options = build_options()
    async for msg in query(prompt=prompt, options=options):
        if isinstance(msg, AssistantMessage):
            for block in msg.content:
                if isinstance(block, TextBlock) and block.text.strip():
                    print(f"Agent: {block.text}")
                elif isinstance(block, ToolUseBlock):
                    print(f"  → tool: {block.name}({block.input})")


async def main():
    await run("What time is it, and what is 12 * 9 + 3?")


if __name__ == "__main__":
    asyncio.run(main())
