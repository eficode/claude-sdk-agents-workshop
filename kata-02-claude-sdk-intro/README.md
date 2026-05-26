# Kata 02: Introduction to the Claude Agent SDK

A port of [`kata-02-strands-intro`](https://github.com/ahokaju/local-ai-agents-workshop/tree/main/kata-02-strands-intro)
using the **Claude Agent SDK** instead of Strands.

## Objective

Build a conversational agent with the Claude Agent SDK. Learn the
difference between one-shot `query()` calls and persistent
`ClaudeSDKClient` sessions, and configure system prompts and models.

## Learning Goals

- Install and import `claude-agent-sdk`
- Run a one-shot query with `query()`
- Hold a multi-turn conversation with `ClaudeSDKClient`
- Configure model, system prompt, and disable built-in tools via
  `ClaudeAgentOptions`
- Understand how the SDK's message stream differs from a single
  string response

## Prerequisites

- Python 3.10+
- `ANTHROPIC_API_KEY` env var **or** a logged-in `claude` CLI (subscription auth)
- `pip install -r ../requirements.txt`

## Time estimate

25–30 minutes.

## Background — what changes vs. Strands

In Strands, an agent is a stateful object you call like a function:

```python
agent = Agent(model=AnthropicModel(...), system_prompt="...")
response = agent("hello")          # returns a string
response = agent("follow-up")      # same instance keeps history
```

The Claude Agent SDK splits these into two shapes:

```python
# One-shot: no state carried between calls
async for msg in query(prompt="hello", options=options):
    ...

# Session: history retained inside the client
async with ClaudeSDKClient(options=options) as client:
    await client.query("hello")
    async for msg in client.receive_response(): ...
    await client.query("follow-up")     # remembers the previous turn
    async for msg in client.receive_response(): ...
```

Also note: the SDK is async-first, and it yields a *stream of typed
messages* (`AssistantMessage`, `ResultMessage`, etc.) rather than a
single string. We pull the text out of `AssistantMessage.content`
blocks ourselves.

## Level 1 — Challenge

Write a script that:

1. Sends a one-shot query and prints the response.
2. Uses a custom system prompt to change tone.
3. Holds a 2-turn conversation where turn 2 references turn 1.
4. Compares Haiku vs. Sonnet on the same prompt (latency only —
   token accounting is out of scope at the SDK level).

### Success criteria

- [ ] `claude-agent-sdk` imports and runs
- [ ] One-shot query returns a sensible answer
- [ ] System prompt visibly changes behavior
- [ ] Session client remembers Alice's name across turns
- [ ] Model comparison prints both responses with timings

## Level 2 — Step by step

### Step 1: Install

```bash
pip install claude-agent-sdk python-dotenv
```

### Step 2: One-shot query

```python
import anyio
from claude_agent_sdk import query, ClaudeAgentOptions, AssistantMessage, TextBlock

async def main():
    options = ClaudeAgentOptions(
        model="claude-haiku-4-5",
        system_prompt="You are concise.",
        allowed_tools=[],       # no Read/Write/Bash — pure chat
    )
    async for msg in query(prompt="Capital of France?", options=options):
        if isinstance(msg, AssistantMessage):
            for block in msg.content:
                if isinstance(block, TextBlock):
                    print(block.text)

anyio.run(main)
```

### Step 3: Multi-turn session

```python
from claude_agent_sdk import ClaudeSDKClient

async with ClaudeSDKClient(options=options) as client:
    await client.query("My name is Alice.")
    async for msg in client.receive_response(): ...
    await client.query("What's my name?")
    async for msg in client.receive_response(): ...
```

The session retains conversation history automatically — same as
Strands' agent instance, but you opt in explicitly by choosing the
client shape over `query()`.

### Step 4: System prompt

Pass `system_prompt="..."` to `ClaudeAgentOptions`. To extend
Claude Code's default prompt instead of replacing it, pass:

```python
system_prompt={"type": "preset", "preset": "claude_code", "append": "Be terse."}
```

For these katas we use a plain string — full replacement.

### Step 5: Model comparison

`ClaudeAgentOptions(model="claude-haiku-4-5")` vs.
`model="claude-sonnet-4-5"`. Run the same prompt under each,
time it, compare.

## Run it

```bash
python solution.py
```

`starter.py` has the same structure with the bodies stubbed —
fill in the TODOs.

## Key differences from Strands kata 02

| Strands kata 02 | This kata |
|-----------------|-----------|
| `agent("...")` returns a string | `query()` / `receive_response()` yield messages — extract text from blocks |
| Sync API | Async (`anyio.run` / `asyncio.run`) |
| Token usage from `response.usage` | Token usage / cost / duration come from `ResultMessage` at the end of the stream |
| Strands has no built-in agentic tools | SDK ships Read/Write/Bash/etc. — must set `allowed_tools=[]` to opt out |
| `Agent` instance is the unit of statefulness | `ClaudeSDKClient` is the session; `query()` is stateless |

## Resources

- [Claude Agent SDK — Python](https://docs.claude.com/en/api/agent-sdk/python)
- [Original Strands kata](https://github.com/ahokaju/local-ai-agents-workshop/blob/main/kata-02-strands-intro/README.md)
