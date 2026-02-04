// MCP 配置示例
// 这个文件展示了如何配置实际的 MCP 服务器连接

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * 创建 MCP 客户端连接
 * @param serverPath MCP 服务器的路径
 * @param args 服务器启动参数
 */
export async function createMCPClient(serverPath: string, args: string[] = []) {
  const transport = new StdioClientTransport({
    command: serverPath,
    args,
  });

  const client = new Client({
    name: 'chat-agent-client',
    version: '1.0.0',
  }, {
    capabilities: {
      tools: {},
      resources: {},
    },
  });

  await client.connect(transport);
  return client;
}

/**
 * MCP 服务器配置示例
 */
export const mcpServers = {
  // 文件系统服务器
  filesystem: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed/directory'],
  },
  
  // Git 服务器
  git: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-git'],
  },
  
  // SQLite 服务器
  sqlite: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite', '/path/to/database.db'],
  },
};

/**
 * 初始化所有 MCP 客户端
 */
export async function initializeMCPClients() {
  const clients: Record<string, Client> = {};
  
  for (const [name, config] of Object.entries(mcpServers)) {
    try {
      clients[name] = await createMCPClient(config.command, config.args);
      console.log(`✓ MCP 客户端 "${name}" 连接成功`);
    } catch (error) {
      console.error(`✗ MCP 客户端 "${name}" 连接失败:`, error);
    }
  }
  
  return clients;
}

/**
 * 调用 MCP 工具
 * @param client MCP 客户端
 * @param toolName 工具名称
 * @param args 工具参数
 */
export async function callMCPTool(
  client: Client,
  toolName: string,
  args: Record<string, unknown>
) {
  try {
    const result = await client.callTool({
      name: toolName,
      arguments: args,
    });
    return result;
  } catch (error) {
    console.error(`调用 MCP 工具 "${toolName}" 失败:`, error);
    throw error;
  }
}

/**
 * 列出 MCP 客户端的所有可用工具
 */
export async function listMCPTools(client: Client) {
  const result = await client.listTools();
  return result.tools;
}
