/**
 * Skills 模块
 *
 * 实现 Anthropic 的 "Agent Skills" 渐进式披露模式。
 *
 * 公共 API:
 * - SkillsManager: 技能管理器，用于加载和管理技能
 * - listSkills: 列出所有技能
 * - readSkillContent: 读取技能内容
 * - getSkillsManager: 获取默认管理器实例
 *
 * 类型:
 * - SkillMetadata: 技能元数据
 * - Skill: 完整技能定义
 * - SkillsConfig: 技能配置
 */

// 类型导出
export type {
  Skill,
  SkillMetadata,
  SkillsConfig,
  SkillsLoadResult,
  FrontmatterResult,
} from './types';

// 加载器导出
export {
  listSkills,
  readSkillContent,
  getSupportingFiles,
  validateSkillName,
} from './load';

// 管理器导出
export {
  SkillsManager,
  getSkillsManager,
  resetSkillsManager,
} from './manager';
