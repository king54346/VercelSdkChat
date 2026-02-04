import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { tool } from 'ai';
import { z } from 'zod';
import { mcpTools, getAllMCPTools } from './lib/mcp-tools';
import { skills, builtinSkills, getSkillsSystemPrompt, getAllSkills } from './lib/skills';
import { mcpClientManager } from './lib/mcp-client';
import { agentExecutor, agentConfigs } from './lib/agents';
import { getLLM, getLLMInfo } from './lib/llm';
import { handleChat } from './lib/chat-handler';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// 存储当前活跃的 Agent 信息
let activeAgentInfo: {
  name: string;
  status: string;
  task?: string;
} | null = null;

// 当前工具集
let allTools: Record<string, ReturnType<typeof tool>> = {};

// 初始化 MCP 客户端和工具
async function initializeMCP() {
  try {
    // 初始化 MCP 客户端，允许访问当前目录和桌面
    const desktopPath = 'C:/Users/31483/Desktop';
    await mcpClientManager.initialize(['.', './src', desktopPath]);

    // 获取所有 MCP 工具
    const mcpToolsFromServer = await getAllMCPTools();

    // 合并所有工具
    allTools = {
      ...mcpToolsFromServer,
      ...skills,           // 技能系统工具 (listSkills, readSkill, createSkill)
      ...builtinSkills,    // 内置技能工具
      // 添加多 Agent 协作工具
      ...createAgentTools(),
    };

    // 将 MCP 工具传递给 Agent 执行器
    agentExecutor.setMCPTools(mcpToolsFromServer);

    console.log(`✓ MCP 初始化完成`);
    console.log(`📦 可用工具数: ${Object.keys(allTools).length}`);
    console.log(`📋 工具列表:`, Object.keys(allTools).join(', '));
  } catch (error) {
    console.error('MCP 初始化失败，使用备用工具:', error);
    allTools = {
      ...mcpTools,
      ...skills,           // 技能系统工具
      ...builtinSkills,    // 内置技能工具
      ...createAgentTools(),
    };
  }
}

// 创建 Agent 协作工具
function createAgentTools() {
  return {
    // 获取可用 Agent 列表
    listAgents: tool({
      description: '列出所有可用的专业 AI Agent',
      parameters: z.object({}),
      execute: async () => {
        return {
          agents: Object.values(agentConfigs).map(agent => ({
            name: agent.name,
            displayName: agent.displayName,
            description: agent.description,
          })),
        };
      },
    }),

    // 调用专业 Agent
    callAgent: tool({
      description: '调用专业 Agent 执行特定任务',
      parameters: z.object({
        agentName: z.enum([
          'code-analyzer',
          'refactorer',
          'test-generator',
          'documentation-writer',
          'performance-optimizer',
        ]).describe('要调用的 Agent 名称'),
        task: z.string().describe('要执行的任务'),
        context: z.string().optional().describe('任务上下文（如代码片段）'),
      }),
      execute: async ({ agentName, task, context }) => {
        activeAgentInfo = {
          name: agentConfigs[agentName]?.displayName || agentName,
          status: 'working',
          task,
        };

        try {
          const result = await agentExecutor.executeAgent(agentName, task, context);
          activeAgentInfo = {
            name: agentConfigs[agentName]?.displayName || agentName,
            status: 'completed',
          };
          return result;
        } catch (error) {
          activeAgentInfo = {
            name: agentConfigs[agentName]?.displayName || agentName,
            status: 'error',
          };
          throw error;
        }
      },
    }),

    // 多 Agent 协作
    collaborativeTask: tool({
      description: '启动多 Agent 协作完成复杂任务',
      parameters: z.object({
        task: z.string().describe('要完成的复杂任务描述'),
      }),
      execute: async ({ task }) => {
        activeAgentInfo = {
          name: 'Orchestrator',
          status: 'coordinating',
          task,
        };

        try {
          const mcpToolsForAgents = await getAllMCPTools();
          const result = await agentExecutor.orchestrate(task, mcpToolsForAgents);

          activeAgentInfo = {
            name: 'Orchestrator',
            status: 'completed',
          };

          return {
            success: true,
            tasksExecuted: result.plan.length,
            plan: result.plan.map(t => ({
              agent: agentConfigs[t.assignedAgent]?.displayName || t.assignedAgent,
              task: t.description,
              status: t.status,
            })),
            summary: result.summary,
          };
        } catch (error) {
          activeAgentInfo = {
            name: 'Orchestrator',
            status: 'error',
          };
          throw error;
        }
      },
    }),
  };
}

// Chat API 端点（使用多步骤处理器）
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: '无效的消息格式' });
    }

    // 使用新的多步骤 chat handler
    await handleChat(messages, allTools, res);
  } catch (error) {
    console.error('Chat error:', error);
    // 检查响应是否已发送
    if (!res.headersSent) {
      res.status(500).json({
        error: '处理请求时出错',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }
});

// 获取可用工具列表
app.get('/api/tools', (_req, res) => {
  const mcpToolNames = Object.keys(mcpTools);
  const skillNames = Object.keys(skills);
  const agentToolNames = ['listAgents', 'callAgent', 'collaborativeTask'];

  const toolsList = Object.keys(allTools).map(key => ({
    name: key,
    description: (allTools[key] as { description?: string }).description || '无描述',
  }));

  res.json({
    mcpTools: mcpToolNames,
    skills: skillNames,
    agentTools: agentToolNames,
    allTools: toolsList,
    mcpStatus: mcpClientManager.getStatus(),
  });
});

// 获取 Agent 列表
app.get('/api/agents', (_req, res) => {
  res.json({
    agents: Object.values(agentConfigs).map(agent => ({
      name: agent.name,
      displayName: agent.displayName,
      description: agent.description,
    })),
    activeAgent: activeAgentInfo,
  });
});

// 调用特定 Agent API
app.post('/api/agents/:agentName', async (req, res) => {
  const { agentName } = req.params;
  const { task, context } = req.body;

  if (!agentConfigs[agentName]) {
    return res.status(404).json({ error: `未找到 Agent: ${agentName}` });
  }

  try {
    activeAgentInfo = {
      name: agentConfigs[agentName].displayName,
      status: 'working',
      task,
    };

    const result = await agentExecutor.executeAgent(agentName, task, context);

    activeAgentInfo = {
      name: agentConfigs[agentName].displayName,
      status: 'completed',
    };

    res.json(result);
  } catch (error) {
    activeAgentInfo = {
      name: agentConfigs[agentName].displayName,
      status: 'error',
    };

    res.status(500).json({
      error: '执行 Agent 时出错',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// 协作任务 API
app.post('/api/collaborate', async (req, res) => {
  const { task } = req.body;

  if (!task) {
    return res.status(400).json({ error: '缺少任务描述' });
  }

  try {
    activeAgentInfo = {
      name: 'Orchestrator',
      status: 'coordinating',
      task,
    };

    const mcpToolsForAgents = await getAllMCPTools();
    const result = await agentExecutor.orchestrate(task, mcpToolsForAgents);

    activeAgentInfo = {
      name: 'Orchestrator',
      status: 'completed',
    };

    res.json(result);
  } catch (error) {
    activeAgentInfo = {
      name: 'Orchestrator',
      status: 'error',
    };

    res.status(500).json({
      error: '协作任务执行失败',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// 获取当前活跃 Agent 状态
app.get('/api/agents/active', (_req, res) => {
  res.json({ activeAgent: activeAgentInfo });
});

// MCP 状态端点
app.get('/api/mcp/status', (_req, res) => {
  res.json({
    initialized: mcpClientManager.isInitialized(),
    status: mcpClientManager.getStatus(),
  });
});

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mcpInitialized: mcpClientManager.isInitialized(),
  });
});

// 启动服务器
async function startServer() {
  // 初始化 MCP
  await initializeMCP();

  const llmInfo = getLLMInfo();
  app.listen(PORT, () => {
    console.log(`\n🚀 Chat Agent API 运行在 http://localhost:${PORT}`);
    console.log(`🧠 LLM: ${llmInfo.provider} (${llmInfo.model})`);
    console.log(`📚 可用工具数: ${Object.keys(allTools).length}`);
    console.log(`🔧 MCP 工具: ${Object.keys(mcpTools).join(', ')}`);
    console.log(`⚡ Skills: ${Object.keys(skills).join(', ')}`);
    console.log(`🤖 Agents: ${Object.values(agentConfigs).map(a => a.displayName).join(', ')}`);
    console.log(`\n📋 API 端点:`);
    console.log(`   POST /api/chat - 聊天接口`);
    console.log(`   GET  /api/tools - 获取工具列表`);
    console.log(`   GET  /api/agents - 获取 Agent 列表`);
    console.log(`   POST /api/agents/:name - 调用特定 Agent`);
    console.log(`   POST /api/collaborate - 多 Agent 协作`);
    console.log(`   GET  /api/mcp/status - MCP 状态`);
  });
}

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n正在关闭服务...');
  await mcpClientManager.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n正在关闭服务...');
  await mcpClientManager.close();
  process.exit(0);
});

startServer().catch(console.error);

export default app;
