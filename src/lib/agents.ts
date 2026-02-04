/**
 * 多 Agent 协作系统
 * 实现多个专业 Agent 协同工作的能力
 */

import { generateText, tool, CoreMessage } from 'ai';
import { z } from 'zod';
import { getLLM } from './llm';

// Agent 类型定义
interface AgentConfig {
  name: string;
  displayName: string;
  description: string;
  systemPrompt: string;
  tools?: Record<string, ReturnType<typeof tool>>;
}

// Agent 执行结果
interface AgentResult {
  agentName: string;
  success: boolean;
  result: string;
  toolCalls?: Array<{
    name: string;
    args: unknown;
    result: unknown;
  }>;
  error?: string;
}

// Agent 协作任务
interface CollaborationTask {
  id: string;
  description: string;
  assignedAgent: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  result?: AgentResult;
}

// 定义专业 Agent 配置
export const agentConfigs: Record<string, AgentConfig> = {
  'code-analyzer': {
    name: 'code-analyzer',
    displayName: '代码分析师',
    description: '专门分析代码质量、复杂度和潜在问题',
    systemPrompt: `你是一个专业的代码分析师。你的任务是：
- 分析代码结构和设计模式
- 评估代码复杂度
- 识别代码异味 (code smells)
- 检测潜在的安全问题
- 评估可维护性

请提供详细、具体的分析结果，包括问题描述和改进建议。`,
  },

  'refactorer': {
    name: 'refactorer',
    displayName: '重构专家',
    description: '专门提供代码重构建议和实现',
    systemPrompt: `你是一个专业的代码重构专家。你的任务是：
- 识别需要重构的代码
- 提供具体的重构方案
- 应用设计模式改进代码
- 简化复杂逻辑
- 提高代码可读性和可维护性

请提供具体的重构建议，包括重构前后的代码对比。`,
  },

  'test-generator': {
    name: 'test-generator',
    displayName: '测试专家',
    description: '专门生成单元测试和集成测试',
    systemPrompt: `你是一个专业的测试工程师。你的任务是：
- 为代码生成全面的单元测试
- 设计边界条件测试
- 创建模拟 (mock) 和存根 (stub)
- 提供测试覆盖率建议
- 设计集成测试场景

请生成可直接运行的测试代码，并说明测试策略。`,
  },

  'documentation-writer': {
    name: 'documentation-writer',
    displayName: '文档专家',
    description: '专门编写代码文档和 API 文档',
    systemPrompt: `你是一个专业的技术文档编写专家。你的任务是：
- 为函数和类编写清晰的文档注释
- 创建 API 文档
- 编写使用示例
- 生成 README 文件
- 创建架构说明文档

请提供清晰、完整、易于理解的文档。`,
  },

  'performance-optimizer': {
    name: 'performance-optimizer',
    displayName: '性能优化师',
    description: '专门分析和优化代码性能',
    systemPrompt: `你是一个专业的性能优化专家。你的任务是：
- 识别性能瓶颈
- 分析时间和空间复杂度
- 提供优化建议
- 建议缓存策略
- 优化数据结构选择

请提供具体的优化建议和预期的性能提升。`,
  },
};

// 创建 Orchestrator 的工具
function createOrchestratorTools() {
  return {
    delegateToAgent: tool({
      description: '将任务分配给专业 Agent',
      parameters: z.object({
        agentName: z.enum([
          'code-analyzer',
          'refactorer',
          'test-generator',
          'documentation-writer',
          'performance-optimizer',
        ]).describe('要分配任务的 Agent 名称'),
        task: z.string().describe('要执行的任务描述'),
        context: z.string().optional().describe('任务相关的上下文信息'),
      }),
      execute: async ({ agentName, task, context }) => {
        return {
          delegated: true,
          agentName,
          task,
          context,
          message: `任务已分配给 ${agentConfigs[agentName]?.displayName || agentName}`,
        };
      },
    }),

    aggregateResults: tool({
      description: '汇总多个 Agent 的执行结果',
      parameters: z.object({
        results: z.array(z.object({
          agentName: z.string(),
          result: z.string(),
        })).describe('各 Agent 的执行结果'),
      }),
      execute: async ({ results }) => {
        return {
          aggregated: true,
          summary: results.map(r => `[${r.agentName}]: ${r.result.substring(0, 100)}...`).join('\n'),
          totalAgents: results.length,
        };
      },
    }),

    getAvailableAgents: tool({
      description: '获取所有可用的专业 Agent 列表',
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
  };
}

// Agent 执行器类
export class AgentExecutor {
  private mcpTools: Record<string, ReturnType<typeof tool>> = {};

  private getModel() {
    return getLLM();
  }

  /**
   * 设置 MCP 工具
   */
  setMCPTools(tools: Record<string, ReturnType<typeof tool>>) {
    this.mcpTools = tools;
  }

  /**
   * 执行单个 Agent
   */
  async executeAgent(
    agentName: string,
    task: string,
    context?: string
  ): Promise<AgentResult> {
    const config = agentConfigs[agentName];

    if (!config) {
      return {
        agentName,
        success: false,
        result: '',
        error: `未找到 Agent: ${agentName}`,
      };
    }

    try {
      const messages: CoreMessage[] = [
        {
          role: 'user',
          content: context ? `任务: ${task}\n\n上下文:\n${context}` : task,
        },
      ];

      const result = await generateText({
        model: this.getModel(),
        system: config.systemPrompt,
        messages,
        tools: { ...config.tools, ...this.mcpTools },
        maxSteps: 3,
      });

      return {
        agentName,
        success: true,
        result: result.text,
        toolCalls: result.toolCalls?.map(call => ({
          name: call.toolName,
          args: call.args,
          result: call.args,
        })),
      };
    } catch (error) {
      return {
        agentName,
        success: false,
        result: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 执行 Orchestrator 进行任务编排
   */
  async orchestrate(
    userRequest: string,
    mcpTools: Record<string, ReturnType<typeof tool>> = {}
  ): Promise<{
    plan: CollaborationTask[];
    results: AgentResult[];
    summary: string;
  }> {
    const orchestratorTools = createOrchestratorTools();
    const allTools = { ...orchestratorTools, ...mcpTools };

    // 第一步：让 Orchestrator 分析任务并制定计划
    const planResult = await generateText({
      model: this.getModel(),
      system: `你是一个任务协调者 (Orchestrator)。你的职责是：
1. 分析用户的请求
2. 决定需要哪些专业 Agent 参与
3. 将任务分解并分配给合适的 Agent
4. 汇总各 Agent 的结果

可用的专业 Agent：
${Object.values(agentConfigs).map(a => `- ${a.displayName} (${a.name}): ${a.description}`).join('\n')}

请使用 delegateToAgent 工具分配任务，然后使用 aggregateResults 汇总结果。`,
      messages: [{ role: 'user', content: userRequest }],
      tools: allTools,
      maxSteps: 5,
    });

    // 解析 Orchestrator 的计划
    const delegations = planResult.toolCalls
      ?.filter(call => call.toolName === 'delegateToAgent')
      .map(call => call.args as { agentName: string; task: string; context?: string }) || [];

    // 创建任务列表
    const tasks: CollaborationTask[] = delegations.map((d, index) => ({
      id: `task-${index + 1}`,
      description: d.task,
      assignedAgent: d.agentName,
      status: 'pending' as const,
    }));

    // 执行各个 Agent 的任务
    const results: AgentResult[] = [];

    for (const task of tasks) {
      task.status = 'in-progress';

      const delegation = delegations.find(d => d.agentName === task.assignedAgent);
      if (delegation) {
        const result = await this.executeAgent(
          task.assignedAgent,
          delegation.task,
          delegation.context
        );
        results.push(result);
        task.status = result.success ? 'completed' : 'failed';
        task.result = result;
      }
    }

    // 生成总结
    const summary = results
      .map(r => {
        const displayName = agentConfigs[r.agentName]?.displayName || r.agentName;
        return `### ${displayName}\n${r.success ? r.result : `错误: ${r.error}`}`;
      })
      .join('\n\n');

    return {
      plan: tasks,
      results,
      summary: `## 协作结果\n\n${summary}`,
    };
  }
}

// 导出单例
export const agentExecutor = new AgentExecutor();

// 导出类型
export type { AgentConfig, AgentResult, CollaborationTask };
