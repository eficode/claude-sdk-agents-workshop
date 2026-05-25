/**
 * Kata 03: Claude Agent SDK with Custom Tools (TypeScript) — Solution
 *
 * Mirrors solution.py. Custom tools live in an in-process MCP server
 * built with createSdkMcpServer(...) and reachable as
 *   mcp__<server>__<tool>
 * in allowedTools.
 *
 * Prerequisites:
 *   npm install
 *   export ANTHROPIC_API_KEY="sk-ant-..."
 *   npm start
 */

import "dotenv/config";
import { z } from "zod";
import {
  query,
  tool,
  createSdkMcpServer,
  type Options,
  type SDKMessage,
  type SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";

const DEFAULT_MODEL = "claude-haiku-4-5";

const Colors = {
  header: (s: string) => `\x1b[1;96m${s}\x1b[0m`,
  prompt: (s: string) => `\x1b[93m${s}\x1b[0m`,
  response: (s: string) => `\x1b[92m${s}\x1b[0m`,
  tool: (s: string) => `\x1b[94m${s}\x1b[0m`,
};

const CITY_COORDINATES: Record<string, { lat: number; lon: number; country: string }> = {
  london: { lat: 51.5074, lon: -0.1278, country: "UK" },
  paris: { lat: 48.8566, lon: 2.3522, country: "France" },
  "new york": { lat: 40.7128, lon: -74.006, country: "USA" },
  tokyo: { lat: 35.6762, lon: 139.6503, country: "Japan" },
  helsinki: { lat: 60.1699, lon: 24.9384, country: "Finland" },
  sydney: { lat: -33.8688, lon: 151.2093, country: "Australia" },
  berlin: { lat: 52.52, lon: 13.405, country: "Germany" },
  amsterdam: { lat: 52.3676, lon: 4.9041, country: "Netherlands" },
};

const textResult = (text: string) => ({ content: [{ type: "text" as const, text }] });

// ============================================================================
// Tools — schemas are zod raw shapes (object property maps). The SDK converts
// them to JSON Schema for the model.
// ============================================================================

const getWeather = tool(
  "get_weather",
  "Get the current weather for a city via Open-Meteo (real data).",
  { city: z.string().describe("City name (london, paris, tokyo, ...).") },
  async ({ city }) => {
    const key = city.toLowerCase();
    const coords = CITY_COORDINATES[key];
    if (!coords) {
      return textResult(`City '${city}' not found. Known: ${Object.keys(CITY_COORDINATES).join(", ")}`);
    }
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", String(coords.lat));
      url.searchParams.set("longitude", String(coords.lon));
      url.searchParams.set("current", "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m");
      url.searchParams.set("timezone", "auto");
      const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return textResult(`Error fetching weather for ${city}: HTTP ${r.status}`);
      const c = (await r.json()).current as Record<string, number>;
      const codes: Record<number, string> = {
        0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
        45: "Fog", 48: "Depositing rime fog",
        51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
        61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
        71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
        80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
        95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
      };
      const condition = codes[c.weather_code] ?? `Code ${c.weather_code}`;
      const cityTitle = city.replace(/\b\w/g, (m) => m.toUpperCase());
      return textResult(
        `Weather in ${cityTitle} (${coords.country}): ${c.temperature_2m}°C, ${condition}, ` +
          `Humidity: ${c.relative_humidity_2m}%, Wind: ${c.wind_speed_10m} km/h`
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return textResult(`Error fetching weather for ${city}: ${msg}`);
    }
  }
);

const calculate = tool(
  "calculate",
  "Evaluate a math expression. Supports + - * / and parentheses.",
  { expression: z.string().describe("A math expression, e.g. '15 * 7 + 23'.") },
  async ({ expression }) => {
    // No external eval in TS land — restrict to digits, ops, parens, dot, whitespace.
    if (!/^[\d+\-*/().\s]+$/.test(expression)) {
      return textResult("Error: expression contains invalid characters");
    }
    try {
      // eslint-disable-next-line no-new-func
      const value = Function(`"use strict"; return (${expression});`)();
      return textResult(`Result: ${value}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return textResult(`Error calculating '${expression}': ${msg}`);
    }
  }
);

const getCurrentTime = tool(
  "get_current_time",
  "Get the current UTC date and time.",
  { tz_name: z.string().default("UTC") },
  async ({ tz_name }) => {
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    return textResult(`Current date and time (${tz_name}): ${now}`);
  }
);

const convertTemperature = tool(
  "convert_temperature",
  "Convert temperature between C, F, K.",
  {
    value: z.number(),
    from_unit: z.enum(["C", "F", "K"]),
    to_unit: z.enum(["C", "F", "K"]),
  },
  async ({ value, from_unit, to_unit }) => {
    const toCelsius = from_unit === "C" ? value : from_unit === "F" ? (value - 32) * 5 / 9 : value - 273.15;
    const out = to_unit === "C" ? toCelsius : to_unit === "F" ? toCelsius * 9 / 5 + 32 : toCelsius + 273.15;
    return textResult(`${value}°${from_unit} = ${out.toFixed(2)}°${to_unit}`);
  }
);

const generateRandomNumber = tool(
  "generate_random_number",
  "Generate a random integer in [min_value, max_value].",
  { min_value: z.number().int(), max_value: z.number().int() },
  async ({ min_value, max_value }) => {
    if (min_value > max_value) return textResult("Error: min_value must be <= max_value");
    const n = Math.floor(Math.random() * (max_value - min_value + 1)) + min_value;
    return textResult(`Random number between ${min_value} and ${max_value}: ${n}`);
  }
);

const getCityInfo = tool(
  "get_city_info",
  "Static facts (country/population/timezone) about a city.",
  { city: z.string() },
  async ({ city }) => {
    const data: Record<string, [string, string, string]> = {
      london: ["UK", "8.8 million", "GMT"],
      paris: ["France", "2.1 million", "CET"],
      "new york": ["USA", "8.3 million", "EST"],
      tokyo: ["Japan", "13.9 million", "JST"],
      helsinki: ["Finland", "0.6 million", "EET"],
      sydney: ["Australia", "5.3 million", "AEST"],
    };
    const row = data[city.toLowerCase()];
    if (!row) return textResult(`No city info available for ${city}.`);
    return textResult(`${city}: ${row[0]}, Population: ${row[1]}, Timezone: ${row[2]}`);
  }
);

const fetchWebpage = tool(
  "fetch_webpage",
  "Fetch a URL and return its text content (truncated to 3000 chars).",
  { url: z.string().url() },
  async ({ url }) => {
    if (!/^https?:\/\//.test(url)) return textResult("Error: URL must start with http:// or https://");
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "Workshop-Agent/1.0" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) return textResult(`Error fetching ${url}: HTTP ${r.status}`);
      let body = await r.text();
      body = body.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
      body = body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
      body = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (body.length > 3000) body = body.slice(0, 3000) + "... [truncated]";
      return textResult(`Content from ${url}:\n${body}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return textResult(`Error fetching ${url}: ${msg}`);
    }
  }
);

const getWebpageTitle = tool(
  "get_webpage_title",
  "Get just the <title> of a webpage.",
  { url: z.string().url() },
  async ({ url }) => {
    if (!/^https?:\/\//.test(url)) return textResult("Error: URL must start with http:// or https://");
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "Workshop-Agent/1.0" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) return textResult(`Error fetching ${url}: HTTP ${r.status}`);
      const m = (await r.text()).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (!m) return textResult(`No <title> found for ${url}`);
      return textResult(`Page title: ${m[1].replace(/\s+/g, " ").trim()}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return textResult(`Error: ${msg}`);
    }
  }
);

// ============================================================================
// Wire the MCP server and options
// ============================================================================

const ALL_TOOLS: SdkMcpToolDefinition<any>[] = [
  getWeather, calculate, getCurrentTime, convertTemperature,
  generateRandomNumber, getCityInfo, fetchWebpage, getWebpageTitle,
];

const WORKSHOP_SERVER = createSdkMcpServer({
  name: "workshop",
  version: "1.0.0",
  tools: ALL_TOOLS,
});

const allowedToolNames = (serverName: string, tools: SdkMcpToolDefinition<any>[]) =>
  tools.map((t) => `mcp__${serverName}__${t.name}`);

function makeOptions({
  systemPrompt,
  toolsSubset,
}: {
  systemPrompt: string;
  toolsSubset?: SdkMcpToolDefinition<any>[];
}): Options {
  const subset = toolsSubset ?? ALL_TOOLS;
  return {
    model: DEFAULT_MODEL,
    systemPrompt,
    mcpServers: { workshop: WORKSHOP_SERVER },
    allowedTools: allowedToolNames("workshop", subset),
  };
}

const GENERAL_PROMPT = `You are a helpful assistant with tools for:
- Real-time weather (Open-Meteo) — get_weather
- Math evaluation — calculate
- Current time — get_current_time
- Temperature conversion — convert_temperature
- Random numbers — generate_random_number
- City facts — get_city_info
- Webpage fetching/titles — fetch_webpage, get_webpage_title

Use tools whenever they would help. Incorporate tool results naturally.`;

const WEATHER_PROMPT = `You are WeatherBot. You can check live weather, convert
temperatures, and look up city facts. Be friendly and give helpful, concise
weather-related advice.`;

// ============================================================================
// Run helper — prints text and tool calls
// ============================================================================

async function run(options: Options, userPrompt: string, label = "Agent") {
  console.log(Colors.prompt(`User: ${userPrompt}`));
  const stream: AsyncIterable<SDKMessage> = query({ prompt: userPrompt, options });
  for await (const msg of stream) {
    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text" && block.text.trim()) {
          console.log(Colors.response(`${label}: ${block.text}`));
        } else if (block.type === "tool_use") {
          console.log(Colors.tool(`  → tool: ${block.name}(${JSON.stringify(block.input)})`));
        }
      }
    }
  }
}

// ============================================================================
// Demo
// ============================================================================

async function main() {
  console.log(Colors.header("=".repeat(70)));
  console.log(Colors.header(" Kata 03: Claude Agent SDK with Custom Tools (TS) — Solution"));
  console.log(Colors.header("=".repeat(70)));

  const general = makeOptions({ systemPrompt: GENERAL_PROMPT });

  const queries: Array<[string, string]> = [
    ["1. Real Weather API", "What's the weather like in Paris right now?"],
    ["2. Math Query", "What is 15 * 7 + 23?"],
    ["3. Time Query", "What time is it right now?"],
    ["4. Temperature Conversion", "Convert 25 degrees Celsius to Fahrenheit"],
    ["5. City Info", "Tell me about Tokyo"],
    ["6. Web Page Title", "What is the title of the page at https://example.com?"],
    ["7. Multi-step Query", "What's the weather in London and Helsinki? Which is colder?"],
  ];
  for (const [title, q] of queries) {
    console.log(Colors.header(`\n${title}`));
    console.log("-".repeat(40));
    await run(general, q);
  }

  console.log(Colors.header("\n" + "=".repeat(70)));
  console.log(Colors.header(" Specialized Weather Agent"));
  console.log(Colors.header("=".repeat(70)));
  const weather = makeOptions({
    systemPrompt: WEATHER_PROMPT,
    toolsSubset: [getWeather, convertTemperature, getCityInfo],
  });
  for (const q of [
    "What's the weather in Helsinki? Should I bring a jacket?",
    "Compare the weather in Sydney and London right now.",
  ]) {
    console.log();
    await run(weather, q, "WeatherBot");
  }

  console.log(Colors.header("\n" + "=".repeat(70)));
  console.log(Colors.header(" Kata 03 Complete!"));
  console.log(Colors.header("=".repeat(70)));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
