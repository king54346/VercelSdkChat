/**
 * 消息适配器测试
 */

import { normalizeMessage, normalizeMessages, type AgentMessage } from './message-adapter';

// 测试 1: 简单文本消息
const simpleMessage: AgentMessage = {
  role: 'user',
  content: '你好',
};

console.log('测试 1 - 简单文本消息:');
console.log(normalizeMessage(simpleMessage));
console.log('');

// 测试 2: 包含文本和工具调用的复杂消息
const complexMessage: AgentMessage = {
  role: 'assistant',
  content: [
    {
      type: 'text',
      text: '我将为你查询天气信息',
    },
    {
      type: 'tool-call',
      toolCallId: 'call_123',
      toolName: 'getWeather',
      args: { city: '北京' },
    },
  ],
};

console.log('测试 2 - 复杂消息（文本 + 工具调用）:');
console.log(normalizeMessage(complexMessage));
console.log('');

// 测试 3: 工具结果消息
const toolResultMessage: AgentMessage = {
  role: 'tool',
  content: [
    {
      type: 'tool-result',
      toolCallId: 'call_123',
      toolName: 'getWeather',
      result: {
        city: '北京',
        temperature: 25,
        weather: '晴天',
      },
    },
  ],
};

console.log('测试 3 - 工具结果消息:');
console.log(normalizeMessage(toolResultMessage));
console.log('');

// 测试 4: 完整对话流程
const conversation: AgentMessage[] = [
  {
    role: 'user',
    content: '查询北京的天气',
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: '好的，我来查询北京的天气',
      },
      {
        type: 'tool-call',
        toolCallId: 'call_123',
        toolName: 'getWeather',
        args: { city: '北京' },
      },
    ],
  },
  {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: 'call_123',
        toolName: 'getWeather',
        result: { temperature: 25, weather: '晴天' },
      },
    ],
  },
  {
    role: 'assistant',
    content: '北京今天天气晴朗，温度 25 度',
  },
];

console.log('测试 4 - 完整对话流程:');
const normalized = normalizeMessages(conversation);
normalized.forEach((msg, i) => {
  console.log(`消息 ${i + 1}:`, JSON.stringify(msg, null, 2));
});
