/**
 * 消息适配器
 * 
 * 将复杂的消息结构（包含 text、tool-call、tool-result）
 * 压平成简单的字符串消息，避免 AI SDK 的格式验证问题
 */

import type { CoreMessage } from 'ai';

/**
 * Agent 内部使用的消息格式
 */
export interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | Array<{
    type: 'text' | 'tool-call' | 'tool-result';
    text?: string;
    toolCallId?: string;
    toolName?: string;
    args?: unknown;
    result?: unknown;
  }>;
}

/**
 * 格式化工具调用为可读文本
 */
function formatToolCall(toolName: string, args: unknown): string {
  const argsStr = args ? JSON.stringify(args, null, 2) : '{}';
  return `[调用工具: ${toolName}]\n参数: ${argsStr}`;
}

/**
 * 格式化工具结果为可读文本
 */
function formatToolResult(toolName: string, result: unknown): string {
  let resultStr: string;
  
  if (typeof result === 'string') {
    resultStr = result;
  } else if (result && typeof result === 'object') {
    // 如果结果太大，截断
    const jsonStr = JSON.stringify(result, null, 2);
    if (jsonStr.length > 2000) {
      resultStr = jsonStr.substring(0, 2000) + '\n...(结果已截断)';
    } else {
      resultStr = jsonStr;
    }
  } else {
    resultStr = String(result);
  }
  
  return `[工具结果: ${toolName}]\n${resultStr}`;
}

/**
 * 将消息内容压平为字符串
 */
function flattenContent(content: AgentMessage['content']): string {
  if (typeof content === 'string') {
    return content;
  }

  // 将所有内容块组合成一个字符串
  const parts: string[] = [];

  for (const block of content) {
    if (block.type === 'text' && block.text) {
      parts.push(block.text);
    } else if (block.type === 'tool-call') {
      parts.push(formatToolCall(block.toolName || 'unknown', block.args));
    } else if (block.type === 'tool-result') {
      parts.push(formatToolResult(block.toolName || 'unknown', block.result));
    }
  }

  return parts.join('\n\n');
}

/**
 * 将 AgentMessage 规范化为 Vercel AI SDK 的 CoreMessage
 * 
 * 核心策略：将所有复杂内容压平为简单的字符串消息
 */
export function normalizeMessage(message: AgentMessage): CoreMessage {
  const content = flattenContent(message.content);

  return {
    role: message.role === 'tool' ? 'assistant' : message.role,
    content,
  };
}

/**
 * 批量规范化消息数组
 */
export function normalizeMessages(messages: AgentMessage[]): CoreMessage[] {
  return messages.map(normalizeMessage);
}

/**
 * 从 CoreMessage 转换为 AgentMessage
 * （用于接收用户输入）
 */
export function toAgentMessage(message: CoreMessage): AgentMessage {
  return {
    role: message.role as 'user' | 'assistant' | 'system',
    content: typeof message.content === 'string' ? message.content : message.content,
  };
}
