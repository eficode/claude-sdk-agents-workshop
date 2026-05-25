"""
Kata 03: Claude Agent SDK with Custom Tools — Solution

Port of kata-03-strands-tools using the Claude Agent SDK.

The big shift from Strands: custom tools aren't plain @tool-decorated Python
functions called by the agent loop directly. They live inside an in-process
MCP server (created via create_sdk_mcp_server) and the agent reaches them via
the MCP protocol. Same code-level ergonomics; very different plumbing under
the hood.

Tool naming when allowlisting:
    mcp__<server_name>__<tool_name>
e.g. server "workshop" + tool "get_weather" -> mcp__workshop__get_weather

Prerequisites:
    pip install -r ../requirements.txt
    export ANTHROPIC_API_KEY="sk-ant-..."
"""

import asyncio
import random
import re
from datetime import datetime, timezone
from typing import Any

import httpx
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

DEFAULT_MODEL = "claude-haiku-4-5"


class Colors:
    HEADER = "\033[1;96m"
    PROMPT = "\033[93m"
    RESPONSE = "\033[92m"
    TOOL = "\033[94m"
    RESET = "\033[0m"

    @classmethod
    def header(cls, s): return f"{cls.HEADER}{s}{cls.RESET}"
    @classmethod
    def prompt(cls, s): return f"{cls.PROMPT}{s}{cls.RESET}"
    @classmethod
    def response(cls, s): return f"{cls.RESPONSE}{s}{cls.RESET}"
    @classmethod
    def tool(cls, s): return f"{cls.TOOL}{s}{cls.RESET}"


CITY_COORDINATES = {
    "london": {"lat": 51.5074, "lon": -0.1278, "country": "UK"},
    "paris": {"lat": 48.8566, "lon": 2.3522, "country": "France"},
    "new york": {"lat": 40.7128, "lon": -74.0060, "country": "USA"},
    "tokyo": {"lat": 35.6762, "lon": 139.6503, "country": "Japan"},
    "helsinki": {"lat": 60.1699, "lon": 24.9384, "country": "Finland"},
    "sydney": {"lat": -33.8688, "lon": 151.2093, "country": "Australia"},
    "berlin": {"lat": 52.5200, "lon": 13.4050, "country": "Germany"},
    "amsterdam": {"lat": 52.3676, "lon": 4.9041, "country": "Netherlands"},
}


def text_result(s: str) -> dict[str, Any]:
    """Shape every tool output as MCP CallToolResult: a list of content blocks."""
    return {"content": [{"type": "text", "text": s}]}


# ==============================================================================
# Tools — each one is an in-process MCP tool.
# ==============================================================================
# Schema dicts use Python builtin types (`str`, `int`, `float`, `bool`) — the
# SDK converts these to JSON Schema for the model. For richer schemas you can
# pass a TypedDict class or a full JSON Schema dict.

@tool("get_weather", "Get the current weather for a city via Open-Meteo (real data).", {"city": str})
async def get_weather(args: dict[str, Any]) -> dict[str, Any]:
    city = args["city"]
    key = city.lower()
    if key not in CITY_COORDINATES:
        return text_result(f"City '{city}' not found. Known: {', '.join(CITY_COORDINATES)}")

    coords = CITY_COORDINATES[key]
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": coords["lat"],
                    "longitude": coords["lon"],
                    "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
                    "timezone": "auto",
                },
            )
            r.raise_for_status()
        c = r.json()["current"]
        codes = {
            0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
            45: "Fog", 48: "Depositing rime fog",
            51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
            61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
            71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
            80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
            95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
        }
        condition = codes.get(c["weather_code"], f"Code {c['weather_code']}")
        return text_result(
            f"Weather in {city.title()} ({coords['country']}): "
            f"{c['temperature_2m']}°C, {condition}, "
            f"Humidity: {c['relative_humidity_2m']}%, Wind: {c['wind_speed_10m']} km/h"
        )
    except httpx.TimeoutException:
        return text_result(f"Error: weather API timed out for {city}")
    except httpx.HTTPError as e:
        return text_result(f"Error fetching weather for {city}: {e}")


@tool("calculate", "Evaluate a math expression. Supports sqrt/sin/cos/tan/pi/e.", {"expression": str})
async def calculate(args: dict[str, Any]) -> dict[str, Any]:
    import math
    expr = args["expression"]
    safe = {
        "abs": abs, "round": round, "min": min, "max": max, "sum": sum, "pow": pow,
        "sqrt": math.sqrt, "sin": math.sin, "cos": math.cos, "tan": math.tan,
        "pi": math.pi, "e": math.e,
    }
    allowed = set("0123456789+-*/.() ,")
    check = expr
    for name in safe:
        check = check.replace(name, "")
    if not all(ch in allowed for ch in check):
        return text_result("Error: expression contains invalid characters")
    try:
        return text_result(f"Result: {eval(expr, {'__builtins__': {}}, safe)}")
    except ZeroDivisionError:
        return text_result("Error: division by zero")
    except Exception as e:
        return text_result(f"Error calculating '{expr}': {e}")


@tool("get_current_time", "Get the current UTC date and time.", {"tz_name": str})
async def get_current_time(args: dict[str, Any]) -> dict[str, Any]:
    tz_name = args.get("tz_name", "UTC")
    now = datetime.now(timezone.utc)
    return text_result(f"Current date and time ({tz_name}): {now.strftime('%Y-%m-%d %H:%M:%S')}")


@tool(
    "convert_temperature",
    "Convert temperature between C, F, K.",
    {"value": float, "from_unit": str, "to_unit": str},
)
async def convert_temperature(args: dict[str, Any]) -> dict[str, Any]:
    value = float(args["value"])
    src, dst = args["from_unit"].upper(), args["to_unit"].upper()
    if src == "C": celsius = value
    elif src == "F": celsius = (value - 32) * 5 / 9
    elif src == "K": celsius = value - 273.15
    else: return text_result(f"Unknown source unit: {src}")
    if dst == "C": out = celsius
    elif dst == "F": out = celsius * 9 / 5 + 32
    elif dst == "K": out = celsius + 273.15
    else: return text_result(f"Unknown target unit: {dst}")
    return text_result(f"{value}°{src} = {out:.2f}°{dst}")


@tool("generate_random_number", "Generate a random int in [min, max].", {"min_value": int, "max_value": int})
async def generate_random_number(args: dict[str, Any]) -> dict[str, Any]:
    lo, hi = int(args["min_value"]), int(args["max_value"])
    if lo > hi:
        return text_result("Error: min_value must be <= max_value")
    return text_result(f"Random number between {lo} and {hi}: {random.randint(lo, hi)}")


@tool("get_city_info", "Static facts (country/population/timezone) about a city.", {"city": str})
async def get_city_info(args: dict[str, Any]) -> dict[str, Any]:
    data = {
        "london": ("UK", "8.8 million", "GMT"),
        "paris": ("France", "2.1 million", "CET"),
        "new york": ("USA", "8.3 million", "EST"),
        "tokyo": ("Japan", "13.9 million", "JST"),
        "helsinki": ("Finland", "0.6 million", "EET"),
        "sydney": ("Australia", "5.3 million", "AEST"),
    }
    city = args["city"]
    row = data.get(city.lower())
    if not row:
        return text_result(f"No city info available for {city}.")
    return text_result(f"{city}: {row[0]}, Population: {row[1]}, Timezone: {row[2]}")


@tool("fetch_webpage", "Fetch a URL and return its text content (truncated).", {"url": str})
async def fetch_webpage(args: dict[str, Any]) -> dict[str, Any]:
    url = args["url"]
    if not url.startswith(("http://", "https://")):
        return text_result("Error: URL must start with http:// or https://")
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "Workshop-Agent/1.0"})
            r.raise_for_status()
        body = r.text
        body = re.sub(r"<script[^>]*>.*?</script>", "", body, flags=re.DOTALL | re.IGNORECASE)
        body = re.sub(r"<style[^>]*>.*?</style>", "", body, flags=re.DOTALL | re.IGNORECASE)
        body = re.sub(r"<[^>]+>", " ", body)
        body = re.sub(r"\s+", " ", body).strip()
        if len(body) > 3000:
            body = body[:3000] + "... [truncated]"
        return text_result(f"Content from {url}:\n{body}")
    except Exception as e:
        return text_result(f"Error fetching {url}: {e}")


@tool("get_webpage_title", "Get just the <title> of a webpage.", {"url": str})
async def get_webpage_title(args: dict[str, Any]) -> dict[str, Any]:
    url = args["url"]
    if not url.startswith(("http://", "https://")):
        return text_result("Error: URL must start with http:// or https://")
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "Workshop-Agent/1.0"})
            r.raise_for_status()
        m = re.search(r"<title[^>]*>(.*?)</title>", r.text, re.IGNORECASE | re.DOTALL)
        if not m:
            return text_result(f"No <title> found for {url}")
        title = re.sub(r"\s+", " ", m.group(1)).strip()
        return text_result(f"Page title: {title}")
    except Exception as e:
        return text_result(f"Error: {e}")


# ==============================================================================
# Build the MCP server and the options that allowlist its tools.
# ==============================================================================

ALL_TOOLS = [
    get_weather, calculate, get_current_time, convert_temperature,
    generate_random_number, get_city_info, fetch_webpage, get_webpage_title,
]

WORKSHOP_SERVER = create_sdk_mcp_server("workshop", "1.0.0", ALL_TOOLS)


def allowed_tool_names(server_name: str, tools) -> list[str]:
    # SDK convention: mcp__<server>__<tool>
    return [f"mcp__{server_name}__{t.name}" for t in tools]


def make_options(*, system_prompt: str, tools_subset=None) -> ClaudeAgentOptions:
    tools_subset = tools_subset or ALL_TOOLS
    return ClaudeAgentOptions(
        model=DEFAULT_MODEL,
        system_prompt=system_prompt,
        mcp_servers={"workshop": WORKSHOP_SERVER},
        allowed_tools=allowed_tool_names("workshop", tools_subset),
    )


GENERAL_PROMPT = """You are a helpful assistant with tools for:
- Real-time weather (Open-Meteo) — get_weather
- Math evaluation — calculate
- Current time — get_current_time
- Temperature conversion — convert_temperature
- Random numbers — generate_random_number
- City facts — get_city_info
- Webpage fetching/titles — fetch_webpage, get_webpage_title

Use tools whenever they would help. Incorporate tool results naturally."""

WEATHER_PROMPT = """You are WeatherBot. You can check live weather, convert
temperatures, and look up city facts. Be friendly and give helpful, concise
weather-related advice."""


# ==============================================================================
# Run a query and print both the model's text and the tool calls it made.
# ==============================================================================

async def run(options: ClaudeAgentOptions, user_prompt: str, *, label: str = "Agent") -> None:
    print(Colors.prompt(f"User: {user_prompt}"))
    async for msg in query(prompt=user_prompt, options=options):
        if isinstance(msg, AssistantMessage):
            for block in msg.content:
                if isinstance(block, TextBlock) and block.text.strip():
                    print(Colors.response(f"{label}: {block.text}"))
                elif isinstance(block, ToolUseBlock):
                    short = {k: v for k, v in block.input.items() if k != "extract_text"}
                    print(Colors.tool(f"  → tool: {block.name}({short})"))


# ==============================================================================
# Demo
# ==============================================================================

async def main():
    print(Colors.header("=" * 70))
    print(Colors.header(" Kata 03: Claude Agent SDK with Custom Tools — Solution"))
    print(Colors.header("=" * 70))

    general = make_options(system_prompt=GENERAL_PROMPT)

    queries = [
        ("1. Real Weather API", "What's the weather like in Paris right now?"),
        ("2. Math Query", "What is 15 * 7 + 23?"),
        ("3. Time Query", "What time is it right now?"),
        ("4. Temperature Conversion", "Convert 25 degrees Celsius to Fahrenheit"),
        ("5. City Info", "Tell me about Tokyo"),
        ("6. Web Page Title", "What is the title of the page at https://example.com?"),
        ("7. Multi-step Query", "What's the weather in London and Helsinki? Which is colder?"),
    ]
    for title, q in queries:
        print(Colors.header(f"\n{title}"))
        print("-" * 40)
        await run(general, q)

    print(Colors.header("\n" + "=" * 70))
    print(Colors.header(" Specialized Weather Agent"))
    print(Colors.header("=" * 70))
    weather_subset = [get_weather, convert_temperature, get_city_info]
    weather = make_options(system_prompt=WEATHER_PROMPT, tools_subset=weather_subset)

    for q in [
        "What's the weather in Helsinki? Should I bring a jacket?",
        "Compare the weather in Sydney and London right now.",
    ]:
        print()
        await run(weather, q, label="WeatherBot")

    print(Colors.header("\n" + "=" * 70))
    print(Colors.header(" Kata 03 Complete!"))
    print(Colors.header("=" * 70))


if __name__ == "__main__":
    asyncio.run(main())
