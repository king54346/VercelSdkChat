/**
 * Chat 处理器
 *
 * 实现多步骤工具调用的循环处理，支持 plan 模式
 */

import { generateText, CoreMessage } from 'ai';
import { Response } from 'express';
import { getLLM } from './llm';
import { getSkillsSystemPrompt } from './skills';
import { normalizeMessages, type AgentMessage } from './message-adapter';

/** 最大步骤数 */
const MAX_STEPS = 10;

/** 系统提示 */
const SYSTEM_PROMPT = `你是一个强大的 AI 编程助手。

## 用户环境信息
- 操作系统: Windows
- 用户桌面路径: C:/Users/31483/Desktop
- 项目路径: C:/Users/31483/WebstormProjects/untitled2
- 允许访问的目录: C:/Users/31483/WebstormProjects/untitled2, C:/Users/31483/Desktop

重要：所有文件路径必须使用 Windows 格式（如 C:/Users/31483/Desktop/demo.txt），不要使用 Linux 格式的路径。

## MCP 工具 (Model Context Protocol)
- filesystem_write_file: 写入文件，参数 path 和 content
- filesystem_read_file: 读取文件
- filesystem_list_directory: 列出目录

## Plan 模式工作流程
当执行复杂任务时，请按以下步骤进行：
1. **分析任务**: 理解用户需求
2. **读取相关技能**: 如果有适用的技能，使用 readSkill 读取指令
   - 示例：readSkill({ name: "web-research" })
   - 注意：name 参数是必填的！
3. **制定计划**: 列出 TODO 清单，说明将要执行的步骤
4. **逐步执行**: 按计划执行每个步骤，调用相应的工具
5. **汇报结果**: 完成后告诉用户执行结果

请在每个步骤都输出文字说明，让用户了解进度。

${getSkillsSystemPrompt()}`;

/**
 * 处理聊天请求（支持多步骤工具调用）
 * 
 * 策略：让 AI SDK 自己处理工具调用，但每步都流式返回结果
 */
export async function handleChat(
  messages: CoreMessage[],
  tools: Record<string, unknown>,
  res: Response
): Promise<void> {
  // 设置 SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    console.log('[Chat] 开始处理聊天请求');

    const result = await generateText({
      model: getLLM(),
      system: SYSTEM_PROMPT,
      messages: messages,
      tools: tools as Parameters<typeof generateText>[0]['tools'],
      maxSteps: 10, // 允许多步工具调用
      onStepFinish: async (step) => {
        console.log(`[Chat] 步骤完成:`, {
          stepType: step.stepType,
          text: step.text?.substring(0, 100),
          toolCallsCount: step.toolCalls?.length || 0,
          toolResultsCount: step.toolResults?.length || 0,
        });
        
        // 发送文本响应
        if (step.text) {
          res.write(`data: ${JSON.stringify({ text: step.text })}\n\n`);
        }

        // 发送工具调用信息
        if (step.toolCalls && step.toolCalls.length > 0) {
          for (const tc of step.toolCalls) {
            console.log(`[Chat] 工具调用:`, tc.toolName, '参数:', JSON.stringify(tc.args));
            console.log(`[Chat] 工具调用完整信息:`, JSON.stringify(tc, null, 2));
            res.write(`data: ${JSON.stringify({
              toolCall: {
                name: tc.toolName,
                args: tc.args,
                status: 'calling'
              }
            })}\n\n`);
          }
        }

        // 发送工具结果
        if (step.toolResults && step.toolResults.length > 0) {
          for (const tr of step.toolResults) {
            const resultStr = JSON.stringify((tr as any).result || 'null');
            console.log(`[Chat] 工具结果:`, tr.toolName, resultStr.substring(0, 200));
            res.write(`data: ${JSON.stringify({
              toolCall: {
                name: tr.toolName,
                result: (tr as any).result,
                status: 'completed'
              }
            })}\n\n`);
          }
        }
      },
    });

    console.log('[Chat] 处理完成:', {
      text: result.text?.substring(0, 100),
      steps: result.steps?.length,
      finishReason: result.finishReason,
      toolCallsCount: result.toolCalls?.length || 0,
    });

    // 打印所有步骤详情
    if (result.steps) {
      result.steps.forEach((step, i) => {
        console.log(`[Chat] 步骤 ${i + 1}:`, {
          stepType: step.stepType,
          text: step.text?.substring(0, 50),
          toolCalls: step.toolCalls?.length || 0,
          toolResults: step.toolResults?.length || 0,
        });
      });
    }

    // 发送最终文本（如果还有）
    if (result.text) {
      res.write(`data: ${JSON.stringify({ text: result.text })}\n\n`);
    }

    // 发送工具调用汇总
    if (result.toolCalls && result.toolCalls.length > 0) {
      const toolCallsSummary = result.toolCalls.map(tc => ({
        name: tc.toolName,
        result: result.toolResults?.find(tr => tr.toolCallId === tc.toolCallId),
      }));
      res.write(`data: ${JSON.stringify({ toolCalls: toolCallsSummary })}\n\n`);
    }

  } catch (error) {
    console.error('[Chat] 错误:', error);
    res.write(`data: ${JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    })}\n\n`);
  }

  // 结束响应
  res.write('data: [DONE]\n\n');
  res.end();

  console.log('[Chat] 响应完成');
}
