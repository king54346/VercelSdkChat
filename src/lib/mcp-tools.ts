/**
 * MCP Tools 定义
 * 接入真实的 MCP 服务器调用
 */

import { tool } from 'ai';
import { z } from 'zod';
import { mcpClientManager } from './mcp-client';

/**
 * 从 MCP 服务器动态加载工具
 */
export async function loadMCPTools(): Promise<Record<string, ReturnType<typeof tool>>> {
  try {
    if (mcpClientManager.isInitialized()) {
      return await mcpClientManager.getToolsAsAITools();
    }
  } catch (error) {
    console.error('加载 MCP 工具失败:', error);
  }

  return {};
}

/**
 * 获取所有 MCP 工具（包括动态加载的）
 */
export async function getAllMCPTools(): Promise<Record<string, ReturnType<typeof tool>>> {
  const dynamicTools = await loadMCPTools();

  // 如果没有动态工具，返回备用工具
  if (Object.keys(dynamicTools).length === 0) {
    return fallbackMcpTools;
  }

  return {
    ...fallbackMcpTools,
    ...dynamicTools,
  };
}

/**
 * 备用 MCP 工具（当 MCP 服务器未连接时使用）
 */
export const fallbackMcpTools = {
  // 文件操作工具
  readFile: tool({
    description: '读取文件内容',
    parameters: z.object({
      path: z.string().describe('文件路径'),
    }),
    execute: async ({ path }) => {
      // 尝试使用 MCP 客户端
      try {
        if (mcpClientManager.isInitialized()) {
          const result = await mcpClientManager.callTool('filesystem', 'read_file', { path });
          return result;
        }
      } catch (error) {
        console.error('MCP readFile 调用失败:', error);
      }

      return {
        success: false,
        content: null,
        message: 'MCP 文件系统服务器未连接，无法读取文件',
        hint: '请确保 MCP 服务器已启动',
      };
    },
  }),

  // 目录列表工具
  listDirectory: tool({
    description: '列出目录内容',
    parameters: z.object({
      path: z.string().describe('目录路径'),
    }),
    execute: async ({ path }) => {
      try {
        if (mcpClientManager.isInitialized()) {
          const result = await mcpClientManager.callTool('filesystem', 'list_directory', { path });
          return result;
        }
      } catch (error) {
        console.error('MCP listDirectory 调用失败:', error);
      }

      return {
        success: false,
        files: [],
        message: 'MCP 文件系统服务器未连接，无法列出目录',
      };
    },
  }),

  // 代码搜索工具
  searchCode: tool({
    description: '在代码库中搜索特定内容',
    parameters: z.object({
      query: z.string().describe('搜索查询'),
      path: z.string().optional().describe('搜索路径'),
    }),
    execute: async ({ query, path }) => {
      try {
        if (mcpClientManager.isInitialized()) {
          const result = await mcpClientManager.callTool('filesystem', 'search_files', {
            pattern: query,
            path: path || '.',
          });
          return result;
        }
      } catch (error) {
        console.error('MCP searchCode 调用失败:', error);
      }

      return {
        success: false,
        results: [],
        message: `搜索 "${query}" - MCP 服务器未连接`,
      };
    },
  }),

  // 获取文件信息
  getFileInfo: tool({
    description: '获取文件的详细信息',
    parameters: z.object({
      path: z.string().describe('文件路径'),
    }),
    execute: async ({ path }) => {
      try {
        if (mcpClientManager.isInitialized()) {
          const result = await mcpClientManager.callTool('filesystem', 'get_file_info', { path });
          return result;
        }
      } catch (error) {
        console.error('MCP getFileInfo 调用失败:', error);
      }

      return {
        success: false,
        info: null,
        message: 'MCP 文件系统服务器未连接，无法获取文件信息',
      };
    },
  }),

  // 写入文件
  writeFile: tool({
    description: '写入内容到文件',
    parameters: z.object({
      path: z.string().describe('文件路径'),
      content: z.string().describe('要写入的内容'),
    }),
    execute: async ({ path, content }) => {
      try {
        if (mcpClientManager.isInitialized()) {
          const result = await mcpClientManager.callTool('filesystem', 'write_file', { path, content });
          return result;
        }
      } catch (error) {
        console.error('MCP writeFile 调用失败:', error);
      }

      return {
        success: false,
        message: 'MCP 文件系统服务器未连接，无法写入文件',
      };
    },
  }),
};

// 默认导出备用工具（兼容性）
export const mcpTools = fallbackMcpTools;
