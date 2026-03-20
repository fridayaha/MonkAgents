import { AgentMentionService } from './agent-mention.service';

describe('AgentMentionService', () => {
  let service: AgentMentionService;

  beforeEach(() => {
    service = new AgentMentionService();
  });

  describe('parseMessage', () => {
    it('should parse single agent mention', () => {
      const result = service.parseMessage('@孙悟空 帮我写代码');

      expect(result.hasMentions).toBe(true);
      expect(result.mentions).toHaveLength(1);
      expect(result.mentions[0].agentId).toBe('wukong');
      expect(result.cleanedContent).toBe('帮我写代码');
    });

    it('should parse multiple agent mentions', () => {
      const result = service.parseMessage('@孙悟空 @猪八戒 一起完成这个任务');

      expect(result.hasMentions).toBe(true);
      expect(result.mentions).toHaveLength(2);
      expect(result.mentions[0].agentId).toBe('wukong');
      expect(result.mentions[1].agentId).toBe('bajie');
      expect(result.primaryAgent).toBe('wukong');
    });

    it('should parse English alias', () => {
      const result = service.parseMessage('@wukong implement a feature');

      expect(result.hasMentions).toBe(true);
      expect(result.mentions[0].agentId).toBe('wukong');
    });

    it('should handle no mentions', () => {
      const result = service.parseMessage('帮我写代码');

      expect(result.hasMentions).toBe(false);
      expect(result.mentions).toHaveLength(0);
      expect(result.cleanedContent).toBe('帮我写代码');
    });

    it('should ignore invalid mentions', () => {
      const result = service.parseMessage('@invalid 帮我写代码');

      expect(result.hasMentions).toBe(false);
      expect(result.mentions).toHaveLength(0);
    });

    it('should parse mixed valid and invalid mentions', () => {
      const result = service.parseMessage('@invalid @孙悟空 写代码');

      expect(result.hasMentions).toBe(true);
      expect(result.mentions).toHaveLength(1);
      expect(result.mentions[0].agentId).toBe('wukong');
    });
  });

  describe('resolveAgentId', () => {
    it('should resolve Chinese aliases', () => {
      expect(service.resolveAgentId('孙悟空')).toBe('wukong');
      expect(service.resolveAgentId('悟空')).toBe('wukong');
      expect(service.resolveAgentId('猪八戒')).toBe('bajie');
      expect(service.resolveAgentId('沙和尚')).toBe('shaseng');
      expect(service.resolveAgentId('如来')).toBe('rulai');
      expect(service.resolveAgentId('唐僧')).toBe('tangseng');
    });

    it('should resolve English aliases', () => {
      expect(service.resolveAgentId('wukong')).toBe('wukong');
      expect(service.resolveAgentId('bajie')).toBe('bajie');
      expect(service.resolveAgentId('shaseng')).toBe('shaseng');
      expect(service.resolveAgentId('rulai')).toBe('rulai');
      expect(service.resolveAgentId('tangseng')).toBe('tangseng');
    });

    it('should resolve nickname aliases', () => {
      expect(service.resolveAgentId('猴子')).toBe('wukong');
      expect(service.resolveAgentId('大圣')).toBe('wukong');
      expect(service.resolveAgentId('老猪')).toBe('bajie');
      expect(service.resolveAgentId('师父')).toBe('tangseng');
    });

    it('should return undefined for unknown alias', () => {
      expect(service.resolveAgentId('unknown')).toBeUndefined();
    });
  });

  describe('getAgentName', () => {
    it('should return correct Chinese names', () => {
      expect(service.getAgentName('wukong')).toBe('孙悟空');
      expect(service.getAgentName('bajie')).toBe('猪八戒');
      expect(service.getAgentName('shaseng')).toBe('沙和尚');
      expect(service.getAgentName('rulai')).toBe('如来佛祖');
      expect(service.getAgentName('tangseng')).toBe('唐僧');
    });
  });

  describe('isValidAgentId', () => {
    it('should return true for valid agent IDs', () => {
      expect(service.isValidAgentId('wukong')).toBe(true);
      expect(service.isValidAgentId('bajie')).toBe(true);
      expect(service.isValidAgentId('shaseng')).toBe(true);
      expect(service.isValidAgentId('rulai')).toBe(true);
      expect(service.isValidAgentId('tangseng')).toBe(true);
    });

    it('should return false for invalid agent IDs', () => {
      expect(service.isValidAgentId('unknown')).toBe(false);
      expect(service.isValidAgentId('random')).toBe(false);
    });
  });

  describe('buildCollaborationInstruction', () => {
    it('should build instruction for single agent', () => {
      const mentions = [
        { agentId: 'wukong', agentName: '孙悟空', position: { start: 0, end: 4 } },
      ];

      const result = service.buildCollaborationInstruction(mentions, '写代码');

      expect(result).toContain('孙悟空请处理');
      expect(result).toContain('写代码');
    });

    it('should build instruction for multiple agents', () => {
      const mentions = [
        { agentId: 'wukong', agentName: '孙悟空', position: { start: 0, end: 4 } },
        { agentId: 'shaseng', agentName: '沙和尚', position: { start: 5, end: 9 } },
      ];

      const result = service.buildCollaborationInstruction(mentions, '协作任务');

      expect(result).toContain('协作任务');
      expect(result).toContain('孙悟空');
      expect(result).toContain('沙和尚');
    });
  });

  describe('extractPriority', () => {
    it('should detect high priority', () => {
      expect(service.extractPriority('紧急任务')).toBe('high');
      expect(service.extractPriority('urgent fix')).toBe('high');
      expect(service.extractPriority('立即处理')).toBe('high');
    });

    it('should detect low priority', () => {
      expect(service.extractPriority('稍后处理')).toBe('low');
      expect(service.extractPriority('不急')).toBe('low');
      expect(service.extractPriority('later')).toBe('low');
    });

    it('should default to medium priority', () => {
      expect(service.extractPriority('普通任务')).toBe('medium');
      expect(service.extractPriority('写代码')).toBe('medium');
    });
  });

  describe('generateAgentPrompt', () => {
    it('should generate basic prompt', () => {
      const prompt = service.generateAgentPrompt('wukong', '写代码');

      expect(prompt).toContain('孙悟空');
      expect(prompt).toContain('写代码');
    });

    it('should include from agent context', () => {
      const prompt = service.generateAgentPrompt('wukong', '写代码', {
        fromAgent: 'tangseng',
      });

      expect(prompt).toContain('唐僧');
      expect(prompt).toContain('请求你协助');
    });

    it('should include working directory', () => {
      const prompt = service.generateAgentPrompt('wukong', '写代码', {
        workingDirectory: '/project/src',
      });

      expect(prompt).toContain('/project/src');
    });
  });
});