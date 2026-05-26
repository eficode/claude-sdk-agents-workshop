"""
Kata 02: Claude Agent SDK Introduction — Starter

Fill in the TODOs. Compare your result with solution.py when stuck.

Prerequisites:
    pip install claude-agent-sdk python-dotenv
    export ANTHROPIC_API_KEY="sk-ant-..."   # or use Claude Code subscription auth
"""

import asyncio

from dotenv import load_dotenv

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    ResultMessage,
    TextBlock,
    query,
)

load_dotenv()

DEFAULT_MODEL = "claude-haiku-4-5"
COMPARISON_MODEL = "claude-sonnet-4-5"


async def collect_text(stream) -> str:
    """Drain an SDK message stream into a single string.

    The SDK yields typed messages — only AssistantMessage.content[*] TextBlocks
    carry the model's text reply. Tool use / result messages are ignored here."""
    parts: list[str] = []
    async for msg in stream:
        if isinstance(msg, AssistantMessage):
            for block in msg.content:
                if isinstance(block, TextBlock):
                    parts.append(block.text)
    return "".join(parts)


# -----------------------------------------------------------------------------
# TODO 1: one-shot query
# -----------------------------------------------------------------------------
# - Build a ClaudeAgentOptions with model=DEFAULT_MODEL and allowed_tools=[].
# - Call query(prompt=..., options=...) and await collect_text(...) on it.
# - Print the response.
async def demo_basic_query():
    raise NotImplementedError("TODO 1: one-shot query")


# -----------------------------------------------------------------------------
# TODO 2: system prompt
# -----------------------------------------------------------------------------
# - Same as TODO 1, but pass system_prompt="You are a friendly weather assistant..."
# - Ask "Why is the sky blue?" and print the answer.
async def demo_system_prompt():
    raise NotImplementedError("TODO 2: system prompt")


# -----------------------------------------------------------------------------
# TODO 3: multi-turn session
# -----------------------------------------------------------------------------
# - Build options as before.
# - Use `async with ClaudeSDKClient(options=options) as client:`
# - Turn 1: await client.query("My name is Alice...") then collect_text(client.receive_response())
# - Turn 2: ask "What's my name?" — should remember Alice.
async def demo_multi_turn():
    raise NotImplementedError("TODO 3: multi-turn session")


# -----------------------------------------------------------------------------
# TODO 4 (optional): model comparison
# -----------------------------------------------------------------------------
# Run the same prompt through DEFAULT_MODEL and COMPARISON_MODEL via query()
# and read timing/tokens/cost off the ResultMessage at the end of each stream.
# Hint: build ClaudeAgentOptions(model=model_id, allowed_tools=[]), then
# `async for msg in query(...)` — capture AssistantMessage TextBlocks AND the
# trailing ResultMessage (msg.duration_ms / msg.usage / msg.total_cost_usd).
async def compare_models(prompt: str) -> dict:
    raise NotImplementedError("TODO 4 (optional): model comparison")


async def main():
    await demo_basic_query()
    await demo_system_prompt()
    await demo_multi_turn()
    # results = await compare_models("Explain what causes thunder in one sentence.")
    # for r in results.values():
    #     print(r["name"], r["time"], r["response"])


if __name__ == "__main__":
    asyncio.run(main())
