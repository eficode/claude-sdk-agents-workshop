"""
Kata 02: Claude Agent SDK Introduction — Solution

Port of kata-02-strands-intro using the Claude Agent SDK.

Prerequisites:
    pip install claude-agent-sdk anthropic python-dotenv
    export ANTHROPIC_API_KEY="sk-ant-..."
"""

import asyncio
import time

from anthropic import Anthropic
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

MODEL_PRICING = {
    "claude-sonnet-4-5": {"input": 3.00, "output": 15.00, "name": "Sonnet 4.5"},
    "claude-haiku-4-5": {"input": 0.80, "output": 4.00, "name": "Haiku 4.5"},
}


class Colors:
    HEADER = "\033[96m"
    PROMPT = "\033[93m"
    RESPONSE = "\033[92m"
    STATS = "\033[95m"
    BOLD = "\033[1m"
    RESET = "\033[0m"

    @classmethod
    def header(cls, text):
        return f"{cls.BOLD}{cls.HEADER}{text}{cls.RESET}"

    @classmethod
    def prompt(cls, text):
        return f"{cls.PROMPT}{text}{cls.RESET}"

    @classmethod
    def response(cls, text):
        return f"{cls.RESPONSE}{text}{cls.RESET}"

    @classmethod
    def stats(cls, text):
        return f"{cls.STATS}{text}{cls.RESET}"


def basic_options(model: str = DEFAULT_MODEL, system_prompt: str | None = None) -> ClaudeAgentOptions:
    """Shared options builder. allowed_tools=[] keeps this kata pure-conversational —
    no Read/Write/Bash/Glob/etc. — so the model only emits text, like in kata-02 Strands."""
    return ClaudeAgentOptions(
        model=model,
        system_prompt=system_prompt,
        allowed_tools=[],
    )


async def collect_text(stream) -> str:
    """Drain an async message stream into a single response string.

    The SDK yields typed messages (AssistantMessage, UserMessage, ResultMessage).
    We only care about text blocks inside assistant messages here."""
    parts: list[str] = []
    async for msg in stream:
        if isinstance(msg, AssistantMessage):
            for block in msg.content:
                if isinstance(block, TextBlock):
                    parts.append(block.text)
    return "".join(parts)


# ==============================================================================
# Demo 1 — basic one-shot query
# ==============================================================================

async def demo_basic_query():
    print(Colors.header("\n1. Basic one-shot query"))
    print("-" * 40)
    user_prompt = "What is the capital of France? Answer briefly."
    print(Colors.prompt(f"User: {user_prompt}"))

    options = basic_options()
    response = await collect_text(query(prompt=user_prompt, options=options))
    print(Colors.response(f"Agent: {response}"))


# ==============================================================================
# Demo 2 — system prompt changes tone
# ==============================================================================

async def demo_system_prompt():
    print(Colors.header("\n2. Custom system prompt (weather assistant)"))
    print("-" * 40)
    options = basic_options(
        system_prompt=(
            "You are a friendly weather assistant. "
            "Explain weather phenomena in simple terms with everyday analogies. "
            "Be concise."
        ),
    )
    user_prompt = "Why is the sky blue?"
    print(Colors.stats("System: 'You are a friendly weather assistant...'"))
    print(Colors.prompt(f"User: {user_prompt}"))

    response = await collect_text(query(prompt=user_prompt, options=options))
    print(Colors.response(f"Weather Agent: {response}"))


# ==============================================================================
# Demo 3 — multi-turn session retains history
# ==============================================================================

async def demo_multi_turn():
    print(Colors.header("\n3. Multi-turn conversation (ClaudeSDKClient)"))
    print("-" * 40)

    options = basic_options()
    async with ClaudeSDKClient(options=options) as client:
        first = "My name is Alice and I study meteorology at university."
        print(Colors.prompt(f"User: {first}"))
        await client.query(first)
        response1 = await collect_text(client.receive_response())
        print(Colors.response(f"Agent: {response1}"))

        second = "What's my name and what do I study?"
        print(Colors.prompt(f"\nUser: {second}"))
        await client.query(second)
        response2 = await collect_text(client.receive_response())
        print(Colors.response(f"Agent: {response2}"))


# ==============================================================================
# Demo 4 — specialized chatbot with detailed system prompt
# ==============================================================================

async def demo_weather_chatbot():
    print(Colors.header("\n4. Specialized WeatherBot"))
    print("-" * 40)
    options = basic_options(
        system_prompt=(
            "You are WeatherBot, an expert weather assistant.\n\n"
            "Capabilities: explain weather phenomena, describe cloud types, "
            "explain forecasting, discuss climate patterns.\n\n"
            "Style: friendly, simple language, practical examples, concise.\n\n"
            "You do not have real-time weather access — explain concepts only."
        ),
    )
    questions = [
        "What are cumulonimbus clouds?",
        "How do meteorologists predict weather?",
    ]
    for q in questions:
        print(Colors.prompt(f"\nUser: {q}"))
        response = await collect_text(query(prompt=q, options=options))
        print(Colors.response(f"WeatherBot: {response}"))


# ==============================================================================
# Demo 5 — model comparison (Haiku vs Sonnet)
# ==============================================================================
# Strands' compare_models used the raw Anthropic client because token usage was
# easier to get there. We keep the same approach: SDK for the agent katas, raw
# Anthropic API for accurate token/cost accounting. This makes the comparison
# apples-to-apples and shows how the two layers coexist.

def compare_models(prompt: str) -> dict:
    client = Anthropic()
    results = {}
    for model_id in [DEFAULT_MODEL, COMPARISON_MODEL]:
        start = time.time()
        response = client.messages.create(
            model=model_id,
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )
        elapsed = time.time() - start
        pricing = MODEL_PRICING[model_id]
        cost = (
            response.usage.input_tokens * pricing["input"] / 1_000_000
            + response.usage.output_tokens * pricing["output"] / 1_000_000
        )
        results[model_id] = {
            "name": pricing["name"],
            "response": response.content[0].text,
            "time": elapsed,
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
            "cost": cost,
        }
    return results


def print_comparison_table(results: dict):
    print(Colors.header("\n┌" + "─" * 58 + "┐"))
    print(Colors.header("│" + " MODEL COMPARISON SUMMARY".center(58) + "│"))
    print(Colors.header("├" + "─" * 12 + "┬" + "─" * 10 + "┬" + "─" * 10 + "┬" + "─" * 10 + "┬" + "─" * 12 + "┤"))
    print(Colors.header("│" + " Model".center(12) + "│" + " Time".center(10) + "│" + " In Tok".center(10) + "│" + " Out Tok".center(10) + "│" + " Cost".center(12) + "│"))
    print(Colors.header("├" + "─" * 12 + "┼" + "─" * 10 + "┼" + "─" * 10 + "┼" + "─" * 10 + "┼" + "─" * 12 + "┤"))
    for data in results.values():
        name = data["name"][:10].center(12)
        time_str = f"{data['time']:.2f}s".center(10)
        in_tok = str(data["input_tokens"]).center(10)
        out_tok = str(data["output_tokens"]).center(10)
        cost_str = f"${data['cost']:.6f}".center(12)
        print(Colors.stats(f"│{name}│{time_str}│{in_tok}│{out_tok}│{cost_str}│"))
    print(Colors.header("└" + "─" * 12 + "┴" + "─" * 10 + "┴" + "─" * 10 + "┴" + "─" * 10 + "┴" + "─" * 12 + "┘"))

    haiku = results.get(DEFAULT_MODEL, {})
    sonnet = results.get(COMPARISON_MODEL, {})
    if haiku and sonnet and haiku["time"] > 0:
        print(Colors.stats(f"\n  Haiku is ~{sonnet['time'] / haiku['time']:.1f}x faster than Sonnet"))
    if haiku and sonnet and haiku["cost"] > 0:
        print(Colors.stats(f"  Haiku is ~{sonnet['cost'] / haiku['cost']:.1f}x cheaper than Sonnet"))


async def demo_model_comparison():
    print(Colors.header("\n5. Model comparison (Haiku vs Sonnet)"))
    print("-" * 40)
    prompt = "Explain what causes thunder in one sentence."
    print(Colors.prompt(f"Prompt: '{prompt}'"))
    print(Colors.stats("\nRunning same prompt on Haiku and Sonnet via raw Anthropic API..."))

    results = compare_models(prompt)
    for data in results.values():
        print(Colors.stats(f"\n{data['name']} ({data['time']:.2f}s):"))
        print(Colors.response(f"  {data['response']}"))
    print_comparison_table(results)


# ==============================================================================
# Demo 6 — bonus: ResultMessage shows what the SDK tracks per turn
# ==============================================================================

async def demo_result_message():
    print(Colors.header("\n6. Bonus: inspecting ResultMessage"))
    print("-" * 40)
    print(Colors.stats("Each SDK turn ends with a ResultMessage containing cost/usage/duration."))

    options = basic_options()
    async for msg in query(prompt="Say hi in five words.", options=options):
        if isinstance(msg, AssistantMessage):
            for block in msg.content:
                if isinstance(block, TextBlock):
                    print(Colors.response(f"Agent: {block.text}"))
        elif isinstance(msg, ResultMessage):
            print(Colors.stats(
                f"  duration={msg.duration_ms}ms "
                f"cost=${msg.total_cost_usd:.6f} "
                f"turns={msg.num_turns}"
            ))


# ==============================================================================
# Entrypoint
# ==============================================================================

async def main():
    print(Colors.header("=" * 70))
    print(Colors.header(" Kata 02: Claude Agent SDK Introduction — Solution"))
    print(Colors.header("=" * 70))

    await demo_basic_query()
    await demo_system_prompt()
    await demo_multi_turn()
    await demo_weather_chatbot()
    await demo_model_comparison()
    await demo_result_message()

    print(Colors.header("\n" + "=" * 70))
    print(Colors.header(" Kata 02 Complete!"))
    print(Colors.header("=" * 70))


if __name__ == "__main__":
    asyncio.run(main())
