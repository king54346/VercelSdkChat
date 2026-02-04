/**
 * LLM 配置模块
 * 支持多个 LLM 提供商 (OpenAI, Qwen 等)
 */

import { createOpenAI } from '@ai-sdk/openai';

// 从环境变量读取配置
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai';

// Qwen 配置
const QWEN_API_KEY = process.env.QWEN_API_KEY;
const QWEN_BASE_URL = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const QWEN_MODEL = process.env.QWEN_MODEL || 'qwen-flash';

// OpenAI 配置
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4-turbo';

// 创建 Qwen 客户端 (使用 OpenAI 兼容接口)
const qwenClient = createOpenAI({
  apiKey: QWEN_API_KEY,
  baseURL: QWEN_BASE_URL,
  compatibility: 'compatible', // 使用 /chat/completions 而不是 /responses
});

// 创建 OpenAI 客户端
const openaiClient = createOpenAI({
  apiKey: OPENAI_API_KEY,
  baseURL: OPENAI_BASE_URL,
});

/**
 * 获取当前配置的 LLM 模型
 */
export function getLLM() {
  if (LLM_PROVIDER === 'qwen') {
    if (!QWEN_API_KEY) {
      throw new Error('QWEN_API_KEY 未配置');
    }
    // 使用 .chat() 强制使用 /chat/completions 端点
    return qwenClient.chat(QWEN_MODEL);
  }

  // 默认使用 OpenAI
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY 未配置');
  }
  return openaiClient(OPENAI_MODEL);
}

/**
 * 获取 LLM 提供商信息
 */
export function getLLMInfo() {
  return {
    provider: LLM_PROVIDER,
    model: LLM_PROVIDER === 'qwen' ? QWEN_MODEL : OPENAI_MODEL,
    baseUrl: LLM_PROVIDER === 'qwen' ? QWEN_BASE_URL : OPENAI_BASE_URL,
  };
}

// 导出默认模型
export const llm = getLLM;
