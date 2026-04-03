import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

export interface SkillDefinition {
  /** Skill ID (filename without extension or directory name) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Brief description */
  description: string;
  /** Full instructions content */
  instructions: string;
  /** File path to SKILL.md */
  filePath: string;
  /** Directory path for nested skills (contains scripts, references, etc.) */
  directoryPath?: string;
  /** Last modified time */
  mtime: Date;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * SkillsDirectoryService
 * Manages skill files in the skills directory
 * Supports hot-reloading and automatic injection into agent prompts
 */
@Injectable()
export class SkillsDirectoryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SkillsDirectoryService.name);

  /** Skills directory path */
  private skillsDir: string;

  /** Loaded skills cache */
  private skills: Map<string, SkillDefinition> = new Map();

  /** Watch timer for hot-reload */
  private watchTimer?: NodeJS.Timeout;

  /** Watch interval in ms */
  private readonly WATCH_INTERVAL = 5000;

  constructor() {
    // Use project root skills directory (monorepo root)
    // process.cwd() in backend is packages/backend, so we need to go up to project root
    this.skillsDir = path.resolve(process.cwd(), '../../skills');
  }

  async onModuleInit() {
    await this.loadSkills();
    this.startWatching();
    this.logger.log(`Skills directory service initialized with ${this.skills.size} skills`);
  }

  onModuleDestroy() {
    if (this.watchTimer) {
      clearInterval(this.watchTimer);
      this.watchTimer = undefined;
    }
  }

  /**
   * Set skills directory path (for testing or custom configuration)
   */
  setSkillsDirectory(dir: string): void {
    this.skillsDir = dir;
    this.loadSkills().catch(err => {
      this.logger.error(`Failed to load skills from ${dir}: ${err}`);
    });
  }

  /**
   * Load all skills from the directory
   * Supports both:
   * - Flat structure: skills/*.md files (skill ID = filename without extension)
   * - Nested structure: skills/<dir>/SKILL.md (skill ID = directory name)
   */
  private async loadSkills(): Promise<void> {
    if (!fs.existsSync(this.skillsDir)) {
      this.logger.debug(`Skills directory not found: ${this.skillsDir}`);
      return;
    }

    const loadedSkills: string[] = [];

    // Load flat .md files in root skills directory (exclude README.md)
    const rootFiles = fs.readdirSync(this.skillsDir)
      .filter(f => f.endsWith('.md') && f !== 'README.md');
    for (const file of rootFiles) {
      const skillId = file.replace('.md', '');
      const filePath = path.join(this.skillsDir, file);

      try {
        await this.loadSkill(skillId, filePath);
        loadedSkills.push(skillId);
      } catch (error) {
        this.logger.error(`Failed to load skill ${skillId}: ${error}`);
      }
    }

    // Load nested skills from subdirectories with SKILL.md
    const subdirs = fs.readdirSync(this.skillsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory() && dirent.name !== 'node_modules')
      .map(dirent => dirent.name);

    for (const subdir of subdirs) {
      const skillPath = path.join(this.skillsDir, subdir, 'SKILL.md');
      if (fs.existsSync(skillPath)) {
        try {
          await this.loadSkill(subdir, skillPath);
          loadedSkills.push(subdir);
        } catch (error) {
          this.logger.error(`Failed to load skill ${subdir}: ${error}`);
        }
      }
    }

    if (loadedSkills.length > 0) {
      this.logger.debug(`Loaded skills: ${loadedSkills.join(', ')}`);
    }
  }

  /**
   * Load a single skill file
   */
  private async loadSkill(skillId: string, filePath: string): Promise<void> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const stats = await fs.promises.stat(filePath);

    // Parse frontmatter if present
    const parsed = this.parseSkillFile(content);

    // Determine if this is a nested skill (has directory with scripts, etc.)
    const parentDir = path.dirname(filePath);
    const parentDirName = path.basename(parentDir);
    const directoryPath = parentDirName === skillId ? parentDir : undefined;

    this.skills.set(skillId, {
      id: skillId,
      name: parsed.name || skillId,
      description: parsed.description || '',
      instructions: parsed.instructions,
      filePath,
      directoryPath,
      mtime: stats.mtime,
      tags: parsed.tags,
    });
  }

  /**
   * Parse a skill file with optional YAML frontmatter
   */
  private parseSkillFile(content: string): {
    name?: string;
    description?: string;
    instructions: string;
    tags?: string[];
  } {
    // Check for frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (!frontmatterMatch) {
      // No frontmatter, entire content is instructions
      return { instructions: content.trim() };
    }

    const frontmatter = frontmatterMatch[1];
    const instructions = frontmatterMatch[2].trim();

    // Parse YAML-like frontmatter
    const result: { name?: string; description?: string; instructions: string; tags?: string[] } = {
      instructions,
    };

    const lines = frontmatter.split('\n');
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();

      switch (key) {
        case 'name':
          result.name = value;
          break;
        case 'description':
          result.description = value;
          break;
        case 'tags':
          result.tags = value.split(',').map(t => t.trim()).filter(Boolean);
          break;
      }
    }

    return result;
  }

  /**
   * Start watching for file changes
   */
  private startWatching(): void {
    this.watchTimer = setInterval(() => {
      this.checkForUpdates().catch(err => {
        this.logger.error(`Error checking for skill updates: ${err}`);
      });
    }, this.WATCH_INTERVAL);
  }

  /**
   * Check for skill file updates
   */
  private async checkForUpdates(): Promise<void> {
    if (!fs.existsSync(this.skillsDir)) return;

    const currentSkillIds = new Set<string>();

    // Check flat .md files
    const rootFiles = fs.readdirSync(this.skillsDir).filter(f => f.endsWith('.md'));
    for (const file of rootFiles) {
      currentSkillIds.add(file.replace('.md', ''));
    }

    // Check nested subdirectories with SKILL.md
    const subdirs = fs.readdirSync(this.skillsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory() && dirent.name !== 'node_modules')
      .map(dirent => dirent.name);
    for (const subdir of subdirs) {
      const skillPath = path.join(this.skillsDir, subdir, 'SKILL.md');
      if (fs.existsSync(skillPath)) {
        currentSkillIds.add(subdir);
      }
    }

    // Check for new or modified files
    for (const skillId of currentSkillIds) {
      const filePath = this.getSkillFilePath(skillId);
      if (!filePath) continue;

      try {
        const stats = await fs.promises.stat(filePath);
        const existing = this.skills.get(skillId);

        if (!existing || existing.mtime < stats.mtime) {
          await this.loadSkill(skillId, filePath);
          this.logger.log(`Skill ${skillId} ${existing ? 'updated' : 'loaded'}`);
        }
      } catch (error) {
        this.logger.error(`Error checking skill ${skillId}: ${error}`);
      }
    }

    // Check for deleted files
    for (const [skillId] of this.skills) {
      if (!currentSkillIds.has(skillId)) {
        this.skills.delete(skillId);
        this.logger.log(`Skill ${skillId} removed`);
      }
    }
  }

  /**
   * Get the file path for a skill ID
   */
  private getSkillFilePath(skillId: string): string | null {
    // Check flat file first
    const flatPath = path.join(this.skillsDir, `${skillId}.md`);
    if (fs.existsSync(flatPath)) return flatPath;

    // Check nested SKILL.md
    const nestedPath = path.join(this.skillsDir, skillId, 'SKILL.md');
    if (fs.existsSync(nestedPath)) return nestedPath;

    return null;
  }

  /**
   * Get the skills directory path
   */
  getSkillsDirectory(): string {
    return this.skillsDir;
  }

  /**
   * Get a skill by ID
   */
  getSkill(skillId: string): SkillDefinition | undefined {
    return this.skills.get(skillId);
  }

  /**
   * Get multiple skills by IDs
   */
  getSkills(skillIds: string[]): SkillDefinition[] {
    return skillIds
      .map(id => this.skills.get(id))
      .filter((s): s is SkillDefinition => s !== undefined);
  }

  /**
   * Get skills instructions for injection into agent prompts
   */
  getSkillsInstructions(skillIds: string[]): string {
    const skills = this.getSkills(skillIds);

    if (skills.length === 0) return '';

    const parts = skills.map(skill => {
      const header = `## ${skill.name}${skill.description ? ` - ${skill.description}` : ''}`;
      return `${header}\n\n${skill.instructions}`;
    });

    return `\n【技能说明】\n\n${parts.join('\n\n---\n\n')}`;
  }

  /**
   * List all available skills
   */
  listSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get skill names and descriptions for display
   */
  getSkillSummaries(): Array<{ id: string; name: string; description: string }> {
    return Array.from(this.skills.values()).map(skill => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
    }));
  }

  /**
   * Check if a skill exists
   */
  hasSkill(skillId: string): boolean {
    return this.skills.has(skillId);
  }

  /**
   * Reload all skills
   */
  async reloadSkills(): Promise<void> {
    this.skills.clear();
    await this.loadSkills();
    this.logger.log(`Reloaded ${this.skills.size} skills`);
  }

  /**
   * Create a new skill file
   */
  async createSkill(skillId: string, content: SkillCreateInput): Promise<SkillDefinition> {
    // Ensure directory exists
    if (!fs.existsSync(this.skillsDir)) {
      await fs.promises.mkdir(this.skillsDir, { recursive: true });
    }

    const filePath = path.join(this.skillsDir, `${skillId}.md`);

    // Build file content with frontmatter
    const frontmatter: string[] = [];
    if (content.name) frontmatter.push(`name: ${content.name}`);
    if (content.description) frontmatter.push(`description: ${content.description}`);
    if (content.tags && content.tags.length > 0) {
      frontmatter.push(`tags: ${content.tags.join(', ')}`);
    }

    let fileContent = '';
    if (frontmatter.length > 0) {
      fileContent = `---\n${frontmatter.join('\n')}\n---\n\n`;
    }
    fileContent += content.instructions;

    await fs.promises.writeFile(filePath, fileContent, 'utf-8');
    await this.loadSkill(skillId, filePath);

    const skill = this.skills.get(skillId);
    if (!skill) throw new Error(`Failed to load created skill ${skillId}`);

    this.logger.log(`Created skill: ${skillId}`);
    return skill;
  }

  /**
   * Delete a skill
   */
  async deleteSkill(skillId: string): Promise<boolean> {
    const skill = this.skills.get(skillId);
    if (!skill) return false;

    await fs.promises.unlink(skill.filePath);
    this.skills.delete(skillId);

    this.logger.log(`Deleted skill: ${skillId}`);
    return true;
  }
}

export interface SkillCreateInput {
  name?: string;
  description?: string;
  instructions: string;
  tags?: string[];
}