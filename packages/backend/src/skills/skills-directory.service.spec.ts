import { Test, TestingModule } from '@nestjs/testing';
import { SkillsDirectoryService, SkillCreateInput } from './skills-directory.service';
import * as fs from 'fs';
import * as path from 'path';

describe('SkillsDirectoryService', () => {
  let service: SkillsDirectoryService;
  let tempSkillsDir: string;

  beforeEach(async () => {
    // Create a temporary directory for skills
    tempSkillsDir = path.join(process.cwd(), 'test-skills-temp');
    if (!fs.existsSync(tempSkillsDir)) {
      fs.mkdirSync(tempSkillsDir, { recursive: true });
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [SkillsDirectoryService],
    }).compile();

    service = module.get<SkillsDirectoryService>(SkillsDirectoryService);
    service.setSkillsDirectory(tempSkillsDir);
  });

  afterEach(() => {
    // Cleanup temp directory
    if (fs.existsSync(tempSkillsDir)) {
      const files = fs.readdirSync(tempSkillsDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tempSkillsDir, file));
      }
      fs.rmdirSync(tempSkillsDir);
    }
    service.onModuleDestroy();
  });

  describe('loadSkills', () => {
    it('should load a skill without frontmatter', async () => {
      const skillContent = 'This is a simple skill instruction.';
      fs.writeFileSync(path.join(tempSkillsDir, 'simple.md'), skillContent);

      await service['loadSkills']();

      const skill = service.getSkill('simple');
      expect(skill).toBeDefined();
      expect(skill?.name).toBe('simple');
      expect(skill?.instructions).toBe(skillContent);
    });

    it('should load a skill with frontmatter', async () => {
      const skillContent = `---
name: Code Review
description: Guidelines for code review
tags: code, review
---

## Code Review Checklist
- Check for bugs
- Check for style`;
      fs.writeFileSync(path.join(tempSkillsDir, 'review.md'), skillContent);

      await service['loadSkills']();

      const skill = service.getSkill('review');
      expect(skill).toBeDefined();
      expect(skill?.name).toBe('Code Review');
      expect(skill?.description).toBe('Guidelines for code review');
      expect(skill?.tags).toEqual(['code', 'review']);
      expect(skill?.instructions).toContain('Code Review Checklist');
    });
  });

  describe('getSkillsInstructions', () => {
    it('should return empty string for non-existent skills', () => {
      const result = service.getSkillsInstructions(['nonexistent']);
      expect(result).toBe('');
    });

    it('should return formatted instructions for existing skills', async () => {
      const skill1 = 'Skill one instructions';
      const skill2 = 'Skill two instructions';

      fs.writeFileSync(path.join(tempSkillsDir, 'skill1.md'), skill1);
      fs.writeFileSync(path.join(tempSkillsDir, 'skill2.md'), skill2);

      await service['loadSkills']();

      const result = service.getSkillsInstructions(['skill1', 'skill2']);

      expect(result).toContain('【技能说明】');
      expect(result).toContain('Skill one instructions');
      expect(result).toContain('Skill two instructions');
    });
  });

  describe('createSkill', () => {
    it('should create a new skill file', async () => {
      const input: SkillCreateInput = {
        name: 'Test Skill',
        description: 'A test skill',
        instructions: 'Do something useful',
        tags: ['test'],
      };

      const skill = await service.createSkill('test-skill', input);

      expect(skill.id).toBe('test-skill');
      expect(skill.name).toBe('Test Skill');
      expect(skill.instructions).toBe('Do something useful');

      // Verify file was created
      expect(fs.existsSync(path.join(tempSkillsDir, 'test-skill.md'))).toBe(true);
    });
  });

  describe('deleteSkill', () => {
    it('should delete an existing skill', async () => {
      fs.writeFileSync(path.join(tempSkillsDir, 'todelete.md'), 'content');
      await service['loadSkills']();

      const result = await service.deleteSkill('todelete');

      expect(result).toBe(true);
      expect(service.hasSkill('todelete')).toBe(false);
      expect(fs.existsSync(path.join(tempSkillsDir, 'todelete.md'))).toBe(false);
    });

    it('should return false for non-existent skill', async () => {
      const result = await service.deleteSkill('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('listSkills', () => {
    it('should return all loaded skills', async () => {
      fs.writeFileSync(path.join(tempSkillsDir, 'skill1.md'), 'content1');
      fs.writeFileSync(path.join(tempSkillsDir, 'skill2.md'), 'content2');

      await service['loadSkills']();

      const skills = service.listSkills();
      expect(skills.length).toBe(2);
      expect(skills.map(s => s.id)).toContain('skill1');
      expect(skills.map(s => s.id)).toContain('skill2');
    });
  });
});