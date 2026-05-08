#!/usr/bin/env node
/**
 * Weather MCP Server
 * 通过 stdio 与 MCP Client 通信，提供两个工具：
 *   - get_current_weather(city)
 *   - get_forecast(city, days)
 * 数据源：Open-Meteo（免费、无需 Key）
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

// ---------- 工具实现 ----------

const WMO_CODE = {
  0: '晴',
  1: '少云',
  2: '多云',
  3: '阴',
  45: '雾',
  48: '冻雾',
  51: '小毛毛雨',
  53: '中等毛毛雨',
  55: '强毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '冻雨',
  67: '强冻雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '雪粒',
  80: '小阵雨',
  81: '中阵雨',
  82: '强阵雨',
  85: '小阵雪',
  86: '强阵雪',
  95: '雷暴',
  96: '雷暴伴小冰雹',
  99: '雷暴伴大冰雹'
};

async function geocode(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    city
  )}&count=1&language=zh&format=json`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`地理编码失败: ${resp.status}`);
  const data = await resp.json();
  if (!data.results || data.results.length === 0) {
    throw new Error(`未找到城市: ${city}`);
  }
  const r = data.results[0];
  return {
    name: r.name,
    country: r.country,
    admin1: r.admin1,
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone
  };
}

async function getCurrentWeather(city) {
  const loc = await geocode(city);
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}` +
    `&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,` +
    `apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m` +
    `&timezone=${encodeURIComponent(loc.timezone)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`天气接口失败: ${resp.status}`);
  const data = await resp.json();
  const c = data.current;
  return {
    location: `${loc.country} ${loc.admin1 || ''} ${loc.name}`.trim(),
    time: c.time,
    weather: WMO_CODE[c.weather_code] || `代码${c.weather_code}`,
    temperature_c: c.temperature_2m,
    apparent_c: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    wind_kmh: c.wind_speed_10m,
    wind_direction: c.wind_direction_10m
  };
}

async function getForecast(city, days = 3) {
  const d = Math.max(1, Math.min(7, Number(days) || 3));
  const loc = await geocode(city);
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}` +
    `&longitude=${loc.longitude}&daily=weather_code,temperature_2m_max,` +
    `temperature_2m_min,precipitation_sum,wind_speed_10m_max` +
    `&forecast_days=${d}&timezone=${encodeURIComponent(loc.timezone)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`天气接口失败: ${resp.status}`);
  const data = await resp.json();
  const daily = data.daily;
  const list = daily.time.map((t, i) => ({
    date: t,
    weather: WMO_CODE[daily.weather_code[i]] || `代码${daily.weather_code[i]}`,
    temp_min_c: daily.temperature_2m_min[i],
    temp_max_c: daily.temperature_2m_max[i],
    precip_mm: daily.precipitation_sum[i],
    wind_max_kmh: daily.wind_speed_10m_max[i]
  }));
  return {
    location: `${loc.country} ${loc.admin1 || ''} ${loc.name}`.trim(),
    days: list
  };
}

// ---------- MCP Server ----------

const server = new Server(
  { name: 'weather-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  {
    name: 'get_current_weather',
    description: '查询指定城市的当前实时天气（温度、体感、湿度、风速、天气状况）。',
    inputSchema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: '城市名称，支持中英文，例如：北京、上海、Tokyo、New York'
        }
      },
      required: ['city']
    }
  },
  {
    name: 'get_forecast',
    description: '查询指定城市未来 N 天的天气预报（默认 3 天，最多 7 天）。',
    inputSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: '城市名称' },
        days: {
          type: 'integer',
          description: '预报天数，1-7 之间，默认 3',
          minimum: 1,
          maximum: 7
        }
      },
      required: ['city']
    }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    let result;
    if (name === 'get_current_weather') {
      result = await getCurrentWeather(args.city);
    } else if (name === 'get_forecast') {
      result = await getForecast(args.city, args.days);
    } else {
      throw new Error(`未知工具: ${name}`);
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `错误: ${e.message}` }]
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
// 不要在 stdout 里输出任何 log，stdio 传输只允许 JSON-RPC
console.error('[weather-mcp] started');
