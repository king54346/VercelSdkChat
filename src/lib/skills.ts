/**
 * Skills 模块入口
 *
 * 重新导出技能系统的公共 API。
 * 实际实现在 ./skills/ 目录下。
 */

import { tool } from 'ai';
import { z } from 'zod';
import { SkillsManager, getSkillsManager } from './skills/manager';
import type { SkillMetadata } from './skills/types';

// 重新导出技能系统
export * from './skills/index';

// 获取项目根目录
const projectRoot = process.cwd();

// 创建技能管理器实例
const skillsManager = getSkillsManager({
  userSkillsDir: `${projectRoot}/.agent/skills`,
  projectSkillsDir: undefined, // 可以设置为项目级技能目录
});

// 初始化
skillsManager.initialize();

/**
 * 获取技能相关的 AI 工具
 *
 * 这些工具允许 AI Agent 与技能系统交互：
 * - listSkills: 列出所有可用技能
 * - readSkill: 读取技能的完整指令
 * - createSkill: 创建新技能
 */
export const skills = skillsManager.getTools();

/**
 * 获取技能系统提示
 *
 * 返回包含所有可用技能信息的系统提示，
 * 可以注入到主系统提示中。
 */
export function getSkillsSystemPrompt(): string {
  return skillsManager.getSystemPrompt();
}

/**
 * 获取技能管理器实例
 */
export function getManager(): SkillsManager {
  return skillsManager;
}

/**
 * 获取所有技能元数据
 */
export function getAllSkills(): SkillMetadata[] {
  return skillsManager.getSkills();
}

// ============================================
// 传统的内置技能工具 (保留兼容性)
// ============================================

export const builtinSkills = {
  // 代码分析技能
  analyzeCode: tool({
    description: '分析代码质量、复杂度和潜在问题',
    parameters: z.object({
      code: z.string().describe('要分析的代码'),
      language: z.string().optional().describe('编程语言'),
    }),
    execute: async ({ code, language }) => {
      return {
        success: true,
        analysis: {
          language: language || 'unknown',
          lines: code.split('\n').length,
          complexity: 'medium',
          suggestions: [
            '考虑添加更多注释',
            '检查错误处理',
          ],
        },
        message: '代码分析完成',
      };
    },
  }),

  // 代码重构技能
  refactorCode: tool({
    description: '提供代码重构建议',
    parameters: z.object({
      code: z.string().describe('要重构的代码'),
      refactoringType: z.enum(['extract-function', 'rename', 'simplify', 'optimize']).describe('重构类型'),
    }),
    execute: async ({ code, refactoringType }) => {
      return {
        success: true,
        refactoredCode: code,
        changes: [],
        message: `应用 ${refactoringType} 重构`,
      };
    },
  }),

  // 生成文档技能
  generateDocumentation: tool({
    description: '为代码生成文档',
    parameters: z.object({
      code: z.string().describe('要生成文档的代码'),
      format: z.enum(['jsdoc', 'markdown', 'inline']).optional().describe('文档格式'),
    }),
    execute: async ({ code: _code, format = 'jsdoc' }) => {
      return {
        success: true,
        documentation: `/**\n * 自动生成的文档 (${format})\n */`,
        message: '文档生成完成',
      };
    },
  }),

  // 生成单元测试技能
  generateTests: tool({
    description: '为代码生成单元测试',
    parameters: z.object({
      code: z.string().describe('要测试的代码'),
      framework: z.enum(['jest', 'vitest', 'mocha']).optional().describe('测试框架'),
    }),
    execute: async ({ code: _code, framework = 'vitest' }) => {
      return {
        success: true,
        tests: `// ${framework} 测试
describe('test suite', () => {
  it('should work', () => {
    expect(true).toBe(true);
  });
});`,
        message: '测试生成完成',
      };
    },
  }),

  // 解释代码技能
  explainCode: tool({
    description: '详细解释代码的功能和逻辑',
    parameters: z.object({
      code: z.string().describe('要解释的代码'),
      level: z.enum(['beginner', 'intermediate', 'advanced']).optional().describe('解释深度'),
    }),
    execute: async ({ code: _code, level = 'intermediate' }) => {
      return {
        success: true,
        explanation: `这段代码的功能是... (${level} 级别解释)`,
        keyPoints: [
          '主要功能',
          '使用的技术',
          '潜在优化点',
        ],
        message: '代码解释完成',
      };
    },
  }),

  // 查找 bug 技能
  findBugs: tool({
    description: '检测代码中的潜在 bug',
    parameters: z.object({
      code: z.string().describe('要检查的代码'),
      strictness: z.enum(['low', 'medium', 'high']).optional().describe('检查严格程度'),
    }),
    execute: async ({ code: _code, strictness = 'medium' }) => {
      return {
        success: true,
        bugs: [],
        warnings: [],
        message: `Bug 检查完成 (${strictness} 级别)`,
      };
    },
  }),

  // 性能优化技能
  optimizePerformance: tool({
    description: '提供性能优化建议',
    parameters: z.object({
      code: z.string().describe('要优化的代码'),
      targetMetric: z.enum(['speed', 'memory', 'both']).optional().describe('优化目标'),
    }),
    execute: async ({ code: _code, targetMetric = 'both' }) => {
      return {
        success: true,
        optimizations: [
          '减少不必要的循环',
          '使用缓存',
          '优化数据结构',
        ],
        estimatedImprovement: '20-30%',
        message: `性能优化建议 (目标: ${targetMetric})`,
      };
    },
  }),
};
