/**
 * MCP 客户端管理
 * 使用 @modelcontextprotocol/sdk 进行 MCP 集成
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { tool } from 'ai';
import { z } from 'zod';
import { spawn } from 'child_process';

// MCP 客户端实例存储
interface MCPClientInstance {
  client: Client;
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  tools: Map<string, unknown>;
}

// JSON Schema 到 Zod 的简单转换
function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodTypeAny {
  const type = schema.type as string;

  if (type === 'string') {
    return z.string().describe((schema.description as string) || '');
  }
  if (type === 'number' || type === 'integer') {
    return z.number().describe((schema.description as string) || '');
  }
  if (type === 'boolean') {
    return z.boolean().describe((schema.description as string) || '');
  }
  if (type === 'array') {
    const items = schema.items as Record<string, unknown>;
    return z.array(jsonSchemaToZod(items || { type: 'string' }));
  }
  if (type === 'object' || schema.properties) {
    const properties = schema.properties as Record<string, Record<string, unknown>> || {};
    const required = (schema.required as string[]) || [];

    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, prop] of Object.entries(properties)) {
      const zodProp = jsonSchemaToZod(prop);
      shape[key] = required.includes(key) ? zodProp : zodProp.optional();
    }

    return z.object(shape);
  }

  return z.any();
}

class MCPClientManager {
  private clients: Map<string, MCPClientInstance> = new Map();
  private initialized = false;

  /**
   * 初始化文件系统 MCP 服务器
   */
  async initializeFilesystemServer(allowedPaths: string[] = ['.']) {
    const name = 'filesystem';

    try {
      console.log(`🔌 正在连接 MCP 服务器: ${name}...`);

      // 创建 stdio 传输
      const transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', ...allowedPaths],
        spawn: spawn as unknown as typeof import('child_process').spawn,
      });

      // 创建客户端
      const client = new Client({
        name: 'chat-agent-client',
        version: '1.0.0',
      }, {
        capabilities: {
          tools: {},
        },
      });

      // 连接
      await client.connect(transport);

      // 获取工具列表
      const toolsResult = await client.listTools();
      const toolsMap = new Map<string, unknown>();

      for (const mcpTool of toolsResult.tools) {
        toolsMap.set(mcpTool.name, mcpTool);
      }

      this.clients.set(name, {
        client,
        name,
        status: 'connected',
        tools: toolsMap,
      });

      console.log(`✓ MCP 服务器 "${name}" 连接成功`);
      console.log(`📦 可用工具: ${toolsResult.tools.map(t => t.name).join(', ')}`);

      return client;
    } catch (error) {
      console.error(`✗ MCP 服务器 "${name}" 连接失败:`, error);
      this.clients.set(name, {
        client: null as unknown as Client,
        name,
        status: 'error',
        tools: new Map(),
      });
      throw error;
    }
  }

  /**
   * 初始化所有 MCP 客户端
   */
  async initialize(allowedPaths: string[] = ['.']) {
    if (this.initialized) {
      console.log('MCP 客户端已初始化，跳过');
      return;
    }

    try {
      await this.initializeFilesystemServer(allowedPaths);
      this.initialized = true;
      console.log('✓ 所有 MCP 客户端初始化完成');
    } catch (error) {
      console.error('MCP 客户端初始化过程中出现错误:', error);
      // 不抛出错误，允许使用备用工具
    }
  }

  /**
   * 将 MCP 工具转换为 Vercel AI SDK 的 tool 格式
   */
  async getToolsAsAITools(): Promise<Record<string, ReturnType<typeof tool>>> {
    const aiTools: Record<string, ReturnType<typeof tool>> = {};

    for (const [clientName, instance] of this.clients.entries()) {
      if (instance.status !== 'connected' || !instance.client) {
        continue;
      }

      for (const [toolName, mcpTool] of instance.tools.entries()) {
        const toolDef = mcpTool as {
          name: string;
          description?: string;
          inputSchema?: Record<string, unknown>;
        };

        const aiToolName = `${clientName}_${toolName}`;

        try {
          // 转换 inputSchema 到 Zod schema
          const zodSchema = toolDef.inputSchema
            ? jsonSchemaToZod(toolDef.inputSchema)
            : z.object({});

          aiTools[aiToolName] = tool({
            description: toolDef.description || `MCP tool: ${toolName}`,
            parameters: zodSchema as z.ZodObject<Record<string, z.ZodTypeAny>>,
            execute: async (args) => {
              try {
                const result = await instance.client.callTool({
                  name: toolName,
                  arguments: args as Record<string, unknown>,
                });
                return result;
              } catch (error) {
                return {
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                };
              }
            },
          });
        } catch (error) {
          console.error(`转换工具 ${toolName} 失败:`, error);
        }
      }
    }

    return aiTools;
  }

  /**
   * 获取客户端状态
   */
  getStatus() {
    const status: Record<string, string> = {};
    for (const [name, instance] of this.clients.entries()) {
      status[name] = instance.status;
    }
    return status;
  }

  /**
   * 关闭所有客户端连接
   */
  async close() {
    for (const [name, instance] of this.clients.entries()) {
      if (instance.client && instance.status === 'connected') {
        try {
          await instance.client.close();
          instance.status = 'disconnected';
          console.log(`✓ MCP 客户端 "${name}" 已关闭`);
        } catch (error) {
          console.error(`关闭 MCP 客户端 "${name}" 失败:`, error);
        }
      }
    }
    this.initialized = false;
  }

  /**
   * 检查是否已初始化
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * 获取指定客户端
   */
  getClient(name: string) {
    const instance = this.clients.get(name);
    return instance?.status === 'connected' ? instance.client : null;
  }

  /**
   * 直接调用 MCP 工具
   */
  async callTool(clientName: string, toolName: string, args: Record<string, unknown>) {
    const instance = this.clients.get(clientName);
    if (!instance || instance.status !== 'connected') {
      throw new Error(`MCP 客户端 "${clientName}" 未连接`);
    }

    return await instance.client.callTool({
      name: toolName,
      arguments: args,
    });
  }
}

// 导出单例
export const mcpClientManager = new MCPClientManager();

// 导出类型
export type { MCPClientInstance };
