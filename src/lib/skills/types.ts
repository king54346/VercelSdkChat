/**
 * Skills 类型定义
 *
 * 实现 Anthropic 的 "Agent Skills" 模式：
 * - 技能从 SKILL.md 文件加载
 * - YAML frontmatter 包含元数据
 * - 支持用户级和项目级技能
 */

/**
 * 技能元数据 (从 YAML frontmatter 解析)
 */
export interface SkillMetadata {
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description: string;
  /** SKILL.md 文件路径 */
  path: string;
  /** 技能来源 ('user' | 'project') */
  source: 'user' | 'project';
}

/**
 * 完整的技能定义 (包含内容)
 */
export interface Skill extends SkillMetadata {
  /** SKILL.md 的完整内容 */
  content?: string;
  /** 支持文件列表 */
  supportingFiles?: string[];
}

/**
 * 技能配置
 */
export interface SkillsConfig {
  /** 用户技能目录 */
  userSkillsDir: string;
  /** 项目技能目录 (可选) */
  projectSkillsDir?: string;
  /** 最大技能文件大小 (字节) */
  maxFileSize?: number;
}

/**
 * 技能加载结果
 */
export interface SkillsLoadResult {
  /** 加载的技能列表 */
  skills: SkillMetadata[];
  /** 加载错误 */
  errors: Array<{ path: string; error: string }>;
}

/**
 * YAML Frontmatter 解析结果
 */
export interface FrontmatterResult {
  /** 解析的元数据 */
  metadata: Record<string, string>;
  /** Markdown 内容 (frontmatter 之后的部分) */
  content: string;
}
