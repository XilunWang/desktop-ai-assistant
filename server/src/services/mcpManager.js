/**
 * MCP Manager
 * - 启动时根据配置 spawn 多个 MCP Server（stdio 传输）
 * - 收集所有 tools，转换为 OpenAI tools schema
 * - 提供 callTool(toolName, args) 路由到对应 Server
 *
 * 注：@modelcontextprotocol/sdk 是 ESM-only，需要通过动态 import 加载
 */

const path = require('path');

const servers = []; // { name, client, transport, tools: [{name, description, inputSchema}] }
const toolIndex = new Map(); // toolName -> serverIndex

/**
 * MCP Server 配置（可后续移到 .env 或 config 文件）
 */
function getServerConfigs() {
  return [
    {
      name: 'weather',
      command: process.execPath, // 当前 node 可执行文件
      args: [path.resolve(__dirname, '..', '..', '..', 'weather-mcp', 'src', 'index.js')],
      env: process.env
    }
    // 可以再加：filesystem / fetch / 自定义...
  ];
}

async function init() {
  // 动态 import ESM
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import(
    '@modelcontextprotocol/sdk/client/stdio.js'
  );

  const cfgs = getServerConfigs();
  for (const cfg of cfgs) {
    try {
      const transport = new StdioClientTransport({
        command: cfg.command,
        args: cfg.args,
        env: cfg.env
      });
      const client = new Client(
        { name: 'desktop-ai-assistant', version: '1.0.0' },
        { capabilities: {} }
      );
      await client.connect(transport);
      const listed = await client.listTools();
      const tools = listed.tools || [];
      const idx = servers.length;
      servers.push({ name: cfg.name, client, transport, tools });
      for (const t of tools) {
        // 处理同名冲突时加前缀（这里简单粗暴：后注册的不覆盖）
        if (!toolIndex.has(t.name)) toolIndex.set(t.name, idx);
      }
      console.log(
        `[mcp] connected server "${cfg.name}", tools:`,
        tools.map((t) => t.name).join(', ')
      );
    } catch (e) {
      console.error(`[mcp] failed to connect server "${cfg.name}":`, e.message);
    }
  }
}

/**
 * 转成 OpenAI Chat Completions 的 tools 格式
 */
function getOpenAITools() {
  const out = [];
  for (const s of servers) {
    for (const t of s.tools) {
      out.push({
        type: 'function',
        function: {
          name: t.name,
          description: t.description || '',
          parameters: t.inputSchema || { type: 'object', properties: {} }
        }
      });
    }
  }
  return out;
}

/**
 * 调用某个工具
 */
async function callTool(toolName, args) {
  const idx = toolIndex.get(toolName);
  if (idx === undefined) {
    throw new Error(`未注册的工具: ${toolName}`);
  }
  const { client } = servers[idx];
  const res = await client.callTool({ name: toolName, arguments: args || {} });

  // res.content 是数组 [{type:'text', text:'...'}]，拼成字符串
  let text = '';
  if (Array.isArray(res?.content)) {
    text = res.content
      .map((c) => (c.type === 'text' ? c.text : JSON.stringify(c)))
      .join('\n');
  } else {
    text = JSON.stringify(res ?? {});
  }
  return { isError: !!res?.isError, text };
}

function hasAnyTool() {
  return toolIndex.size > 0;
}

async function shutdown() {
  for (const s of servers) {
    try {
      await s.client.close?.();
    } catch (e) {
      // ignore
    }
  }
}

module.exports = { init, getOpenAITools, callTool, hasAnyTool, shutdown };
