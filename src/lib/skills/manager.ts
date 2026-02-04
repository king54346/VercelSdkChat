/**
 * 技能管理器
 *
 * 实现 Anthropic 的 "Agent Skills" 渐进式披露模式：
 * 1. 会话开始时解析 SKILL.md 的 YAML frontmatter
 * 2. 将技能元数据 (名称 + 描述) 注入系统提示
 * 3. Agent 在任务相关时读取完整的 SKILL.md 内容
 *
 * 技能目录结构:
 * 用户级: ~/.agent/skills/
 * 项目级: {PROJECT_ROOT}/.agent/skills/
 */

import * as fs from 'fs';
import * as path from 'path';
import { tool } from 'ai';
import { z } from 'zod';
import { listSkills, readSkillContent, getSupportingFiles, validateSkillName } from './load';
import type { SkillMetadata, SkillsConfig } from './types';

/** 默认用户技能目录 */
const DEFAULT_USER_SKILLS_DIR = '.agent/skills';

/** 默认项目技能目录 */
const DEFAULT_PROJECT_SKILLS_DIR = '.agent/skills';

/** 技能系统提示模板 */
const SKILLS_SYSTEM_PROMPT = `
## 技能系统

你可以使用技能库来获取专业能力和领域知识。

{skills_locations}

**可用技能:**

{skills_list}

**如何使用技能 (渐进式披露):**

技能采用**渐进式披露**模式 - 你知道它们存在 (上面显示名称 + 描述)，但只在需要时读取完整指令：

1. **识别适用的技能**: 检查用户任务是否匹配某个技能的描述
2. **读取技能完整指令**: 使用 readSkill 工具读取技能的完整内容
3. **遵循技能指令**: SKILL.md 包含分步骤的工作流程、最佳实践和示例
4. **访问辅助文件**: 技能可能包含 Python 脚本、配置或参考文档

**何时使用技能:**
- 当用户请求匹配某个技能的领域时 (如 "研究 X" → web-research 技能)
- 当需要专业知识或结构化工作流程时
- 当技能为复杂任务提供验证过的模式时

**技能是自文档化的:**
- 每个 SKILL.md 都会告诉你技能的功能和使用方法
- 使用 readSkill 工具读取完整内容

**示例工作流:**

用户: "你能研究一下量子计算的最新发展吗？"

1. 检查上面的可用技能 → 看到 "web-research" 技能
2. 使用 readSkill("web-research") 读取完整指令
3. 遵循技能的研究工作流程 (搜索 → 整理 → 综合)
4. 使用绝对路径引用任何辅助脚本

记住: 技能是让你更强大和一致的工具。有疑问时，检查是否有适用的技能！
`;

/**
 * 技能管理器类
 */
export class SkillsManager {
  private config: SkillsConfig;
  private skills: SkillMetadata[] = [];
  private initialized = false;

  constructor(config?: Partial<SkillsConfig>) {
    // 默认配置
    const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
    this.config = {
      userSkillsDir: config?.userSkillsDir || path.join(homeDir, DEFAULT_USER_SKILLS_DIR),
      projectSkillsDir: config?.projectSkillsDir,
      maxFileSize: config?.maxFileSize || 10 * 1024 * 1024,
    };
  }

  /**
   * 初始化技能管理器，加载所有技能
   */
  initialize(): void {
    this.skills = listSkills(
      this.config.userSkillsDir,
      this.config.projectSkillsDir
    );
    this.initialized = true;
    console.log(`[Skills] 加载了 ${this.skills.length} 个技能`);
  }

  /**
   * 重新加载技能 (捕获目录变化)
   */
  reload(): void {
    this.skills = listSkills(
      this.config.userSkillsDir,
      this.config.projectSkillsDir
    );
    console.log(`[Skills] 重新加载了 ${this.skills.length} 个技能`);
  }

  /**
   * 获取所有加载的技能
   */
  getSkills(): SkillMetadata[] {
    if (!this.initialized) {
      this.initialize();
    }
    return this.skills;
  }

  /**
   * 根据名称获取技能
   */
  getSkill(name: string): SkillMetadata | undefined {
    return this.skills.find(s => s.name === name);
  }

  /**
   * 格式化技能位置显示
   */
  private formatSkillsLocations(): string {
    const locations = [`**用户技能**: \`${this.config.userSkillsDir}\``];
    if (this.config.projectSkillsDir) {
      locations.push(`**项目技能**: \`${this.config.projectSkillsDir}\` (覆盖用户技能)`);
    }
    return locations.join('\n');
  }

  /**
   * 格式化技能列表显示
   */
  private formatSkillsList(): string {
    if (this.skills.length === 0) {
      const locations = [this.config.userSkillsDir];
      if (this.config.projectSkillsDir) {
        locations.push(this.config.projectSkillsDir);
      }
      return `(暂无可用技能。你可以在 ${locations.join(' 或 ')} 创建技能)`;
    }

    // 按来源分组
    const userSkills = this.skills.filter(s => s.source === 'user');
    const projectSkills = this.skills.filter(s => s.source === 'project');

    const lines: string[] = [];

    if (userSkills.length > 0) {
      lines.push('**用户技能:**');
      for (const skill of userSkills) {
        lines.push(`- **${skill.name}**: ${skill.description}`);
        lines.push(`  → 使用 readSkill("${skill.name}") 获取完整指令`);
      }
      lines.push('');
    }

    if (projectSkills.length > 0) {
      lines.push('**项目技能:**');
      for (const skill of projectSkills) {
        lines.push(`- **${skill.name}**: ${skill.description}`);
        lines.push(`  → 使用 readSkill("${skill.name}") 获取完整指令`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 生成技能系统提示
   */
  getSystemPrompt(): string {
    if (!this.initialized) {
      this.initialize();
    }

    return SKILLS_SYSTEM_PROMPT
      .replace('{skills_locations}', this.formatSkillsLocations())
      .replace('{skills_list}', this.formatSkillsList());
  }

  /**
   * 将技能系统提示注入到现有提示中
   */
  injectIntoSystemPrompt(existingPrompt: string): string {
    const skillsSection = this.getSystemPrompt();
    return existingPrompt + '\n\n' + skillsSection;
  }

  /**
   * 获取技能相关的 AI 工具
   */
  getTools(): Record<string, ReturnType<typeof tool>> {
    return {
      // 列出所有可用技能
      listSkills: tool({
        description: '列出所有可用的技能',
        parameters: z.object({}),
        execute: async () => {
          return {
            skills: this.skills.map(s => ({
              name: s.name,
              description: s.description,
              source: s.source,
            })),
            total: this.skills.length,
          };
        },
      }),

      // 读取技能完整内容
      readSkill: tool({
        description: '读取指定技能的完整指令内容。使用示例: readSkill({ name: "web-research" })',
        parameters: z.object({
          // 改为可选，并提供默认值提示
          name: z.string().optional().describe('技能名称。例如: "web-research", "code-analysis"'),
        }),
        execute: async ({ name }) => {
          console.log('[Skills] readSkill 被调用，参数:', { name });
          
          const availableSkills = this.skills.map(s => s.name);
          
          // 如果没有提供参数，返回有用的错误信息
          if (!name || name.trim() === '') {
            console.error('[Skills] readSkill 错误: 缺少技能名称');
            return {
              success: false,
              error: '⚠️  请提供技能名称。\n\n' +
                     `✅ 正确用法：readSkill({ name: "web-research" })\n\n` +
                     `📚 可用技能：\n${availableSkills.map(s => `  - ${s}`).join('\n')}`,
              availableSkills,
            };
          }
          
          const skillName = name.trim();
          const skill = this.getSkill(skillName);
          
          if (!skill) {
            console.error('[Skills] readSkill 错误: 未找到技能:', skillName);
            return {
              success: false,
              error: `❌ 未找到技能: "${skillName}"\n\n` +
                     `📚 可用技能：\n${availableSkills.map(s => `  - ${s}`).join('\n')}`,
              availableSkills,
            };
          }

          const content = readSkillContent(skill.path);
          const supportingFiles = getSupportingFiles(skill.path);

          console.log('[Skills] readSkill 成功:', skill.name);
          return {
            success: true,
            name: skill.name,
            description: skill.description,
            content: content || '无法读取技能内容',
            supportingFiles,
            skillDir: path.dirname(skill.path),
          };
        },
      }),

      // 创建新技能
      createSkill: tool({
        description: '创建一个新的技能',
        parameters: z.object({
          name: z.string().describe('技能名称 (只能包含字母、数字、连字符和下划线)'),
          description: z.string().describe('技能描述'),
          content: z.string().optional().describe('技能指令内容 (可选)'),
          projectLevel: z.boolean().optional().describe('是否创建为项目级技能'),
        }),
        execute: async ({ name, description, content, projectLevel }) => {
          // 验证名称
          const validation = validateSkillName(name);
          if (!validation.valid) {
            return {
              success: false,
              error: validation.error,
            };
          }

          // 确定目标目录
          const targetDir = projectLevel && this.config.projectSkillsDir
            ? this.config.projectSkillsDir
            : this.config.userSkillsDir;

          const skillDir = path.join(targetDir, name);
          const skillMdPath = path.join(skillDir, 'SKILL.md');

          // 检查是否已存在
          if (fs.existsSync(skillDir)) {
            return {
              success: false,
              error: `技能 "${name}" 已存在于 ${skillDir}`,
            };
          }

          // 创建目录
          fs.mkdirSync(skillDir, { recursive: true });

          // 生成 SKILL.md 模板
          const template = `---
name: ${name}
description: ${description}
---

# ${name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} 技能

## 描述

${description}

## 使用场景

- [场景 1: 当用户要求...]
- [场景 2: 当需要...]

## 使用方法

### 步骤 1: [第一步]
[说明第一步要做什么]

### 步骤 2: [第二步]
[说明第二步要做什么]

## 最佳实践

- [最佳实践 1]
- [最佳实践 2]

## 示例

### 示例 1

**用户请求:** "[示例请求]"

**方法:**
1. [分步骤说明]
2. [使用的工具和命令]
3. [预期结果]

${content ? `\n## 自定义内容\n\n${content}` : ''}
`;

          fs.writeFileSync(skillMdPath, template);

          // 重新加载技能
          this.reload();

          return {
            success: true,
            message: `技能 "${name}" 创建成功`,
            path: skillMdPath,
            skillDir,
          };
        },
      }),
    };
  }
}

// 导出单例
let defaultManager: SkillsManager | null = null;

/**
 * 获取默认的技能管理器实例
 */
export function getSkillsManager(config?: Partial<SkillsConfig>): SkillsManager {
  if (!defaultManager) {
    defaultManager = new SkillsManager(config);
  }
  return defaultManager;
}

/**
 * 重置默认管理器 (用于测试)
 */
export function resetSkillsManager(): void {
  defaultManager = null;
}
