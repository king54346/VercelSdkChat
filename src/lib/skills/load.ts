/**
 * 技能加载器
 *
 * 解析 SKILL.md 文件的 YAML frontmatter，加载技能元数据。
 *
 * 每个技能是一个目录，包含：
 * - SKILL.md (必需): YAML frontmatter + 指令
 * - 可选的辅助文件 (脚本、配置等)
 *
 * SKILL.md 结构示例:
 * ```markdown
 * ---
 * name: web-research
 * description: 结构化的网络研究方法
 * ---
 *
 * # Web Research Skill
 *
 * ## 使用场景
 * - 用户要求研究某个主题
 * ...
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';
import type { FrontmatterResult, SkillMetadata, SkillsLoadResult } from './types';

/** 最大技能文件大小 (10MB) */
const MAX_SKILL_FILE_SIZE = 10 * 1024 * 1024;

/**
 * 检查路径是否安全 (防止路径遍历攻击)
 */
function isSafePath(targetPath: string, baseDir: string): boolean {
  try {
    const resolvedTarget = path.resolve(targetPath);
    const resolvedBase = path.resolve(baseDir);

    // 检查目标路径是否在基础目录内
    return resolvedTarget.startsWith(resolvedBase + path.sep) ||
           resolvedTarget === resolvedBase;
  } catch {
    return false;
  }
}

/**
 * 解析 YAML frontmatter
 *
 * 简单的 YAML 解析，只支持 key: value 格式
 */
function parseFrontmatter(content: string): FrontmatterResult | null {
  // 匹配 --- 分隔符之间的 YAML frontmatter
  const frontmatterPattern = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterPattern);

  if (!match) {
    return null;
  }

  const [, yamlContent, markdownContent] = match;
  const metadata: Record<string, string> = {};

  // 解析 key: value 对
  for (const line of yamlContent.split('\n')) {
    const kvMatch = line.trim().match(/^(\w+):\s*(.+)$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      metadata[key] = value.trim();
    }
  }

  return {
    metadata,
    content: markdownContent,
  };
}

/**
 * 解析单个技能的元数据
 */
function parseSkillMetadata(
  skillMdPath: string,
  source: 'user' | 'project'
): SkillMetadata | null {
  try {
    // 检查文件大小
    const stats = fs.statSync(skillMdPath);
    if (stats.size > MAX_SKILL_FILE_SIZE) {
      console.warn(`[Skills] 跳过过大的文件: ${skillMdPath}`);
      return null;
    }

    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const result = parseFrontmatter(content);

    if (!result) {
      console.warn(`[Skills] 无法解析 frontmatter: ${skillMdPath}`);
      return null;
    }

    const { metadata } = result;

    // 验证必需字段
    if (!metadata.name || !metadata.description) {
      console.warn(`[Skills] 缺少必需字段 (name/description): ${skillMdPath}`);
      return null;
    }

    return {
      name: metadata.name,
      description: metadata.description,
      path: skillMdPath,
      source,
    };
  } catch (error) {
    console.error(`[Skills] 加载技能失败: ${skillMdPath}`, error);
    return null;
  }
}

/**
 * 从单个目录加载技能
 */
function loadSkillsFromDir(
  skillsDir: string,
  source: 'user' | 'project'
): SkillMetadata[] {
  const skills: SkillMetadata[] = [];

  // 检查目录是否存在
  if (!fs.existsSync(skillsDir)) {
    return skills;
  }

  const resolvedBase = path.resolve(skillsDir);

  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      // 只处理目录
      if (!entry.isDirectory()) {
        continue;
      }

      const skillDir = path.join(skillsDir, entry.name);

      // 安全检查
      if (!isSafePath(skillDir, resolvedBase)) {
        console.warn(`[Skills] 跳过不安全路径: ${skillDir}`);
        continue;
      }

      // 查找 SKILL.md
      const skillMdPath = path.join(skillDir, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) {
        continue;
      }

      // 安全检查
      if (!isSafePath(skillMdPath, resolvedBase)) {
        console.warn(`[Skills] 跳过不安全的 SKILL.md: ${skillMdPath}`);
        continue;
      }

      // 解析元数据
      const metadata = parseSkillMetadata(skillMdPath, source);
      if (metadata) {
        skills.push(metadata);
      }
    }
  } catch (error) {
    console.error(`[Skills] 扫描目录失败: ${skillsDir}`, error);
  }

  return skills;
}

/**
 * 加载所有技能
 *
 * 支持用户级和项目级技能：
 * - 用户技能先加载
 * - 项目技能后加载，可覆盖同名的用户技能
 *
 * @param userSkillsDir - 用户技能目录
 * @param projectSkillsDir - 项目技能目录 (可选)
 * @returns 技能元数据列表
 */
export function listSkills(
  userSkillsDir?: string,
  projectSkillsDir?: string
): SkillMetadata[] {
  const allSkills = new Map<string, SkillMetadata>();

  // 加载用户技能
  if (userSkillsDir) {
    const userSkills = loadSkillsFromDir(userSkillsDir, 'user');
    for (const skill of userSkills) {
      allSkills.set(skill.name, skill);
    }
  }

  // 加载项目技能 (覆盖同名用户技能)
  if (projectSkillsDir) {
    const projectSkills = loadSkillsFromDir(projectSkillsDir, 'project');
    for (const skill of projectSkills) {
      allSkills.set(skill.name, skill);
    }
  }

  return Array.from(allSkills.values());
}

/**
 * 读取技能的完整内容
 *
 * @param skillPath - SKILL.md 文件路径
 * @returns 技能的完整 Markdown 内容，或 null (如果读取失败)
 */
export function readSkillContent(skillPath: string): string | null {
  try {
    if (!fs.existsSync(skillPath)) {
      return null;
    }

    const content = fs.readFileSync(skillPath, 'utf-8');
    const result = parseFrontmatter(content);

    // 返回 frontmatter 之后的内容
    return result ? result.content : content;
  } catch (error) {
    console.error(`[Skills] 读取技能内容失败: ${skillPath}`, error);
    return null;
  }
}

/**
 * 获取技能目录下的辅助文件
 *
 * @param skillPath - SKILL.md 文件路径
 * @returns 辅助文件列表
 */
export function getSupportingFiles(skillPath: string): string[] {
  try {
    const skillDir = path.dirname(skillPath);

    if (!fs.existsSync(skillDir)) {
      return [];
    }

    const files = fs.readdirSync(skillDir);
    return files
      .filter(f => f !== 'SKILL.md')
      .map(f => path.join(skillDir, f));
  } catch {
    return [];
  }
}

/**
 * 验证技能名称 (防止路径遍历攻击)
 */
export function validateSkillName(name: string): { valid: boolean; error?: string } {
  if (!name || !name.trim()) {
    return { valid: false, error: '名称不能为空' };
  }

  if (name.includes('..')) {
    return { valid: false, error: '名称不能包含 ".."' };
  }

  if (name.startsWith('/') || name.startsWith('\\')) {
    return { valid: false, error: '名称不能是绝对路径' };
  }

  if (name.includes('/') || name.includes('\\')) {
    return { valid: false, error: '名称不能包含路径分隔符' };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return { valid: false, error: '名称只能包含字母、数字、连字符和下划线' };
  }

  return { valid: true };
}
