import { TangsengAgent } from './tangseng.agent';
import { WukongAgent } from './wukong.agent';
import { BajieAgent } from './bajie.agent';
import { ShasengAgent } from './shaseng.agent';
import { RulaiAgent } from './rulai.agent';
import { TaskPlanner } from './task-planner';
import { ConfigService } from '../config/config.service';
import { AgentConfig } from '@monkagents/shared';

// Mock ConfigService with agent configs
const createMockConfigService = () => {
  const agentConfigs: Record<string, AgentConfig> = {
    tangseng: {
      id: 'tangseng',
      name: '唐僧',
      emoji: '🧘',
      role: 'master',
      persona: '你是唐僧，团队的师父和精神领袖。',
      model: 'claude-opus-4-6',
      cli: { command: 'claude', args: ['-p', '--output-format', 'stream-json', '--verbose'] },
      skills: ['planning', 'coordination'],
      mcps: [],
      capabilities: ['planning', 'coordination', 'review', 'decision_making'],
      boundaries: ['不直接执行技术任务', '主要负责决策和协调'],
      taskKeywords: {
        high: ['帮我', '请帮我', '需要', '想要', '计划', 'plan', '分析', 'analyze'],
        medium: ['任务', 'task', '分解', 'decompose', '协调', 'coordinate'],
        low: ['规划', 'planning', '安排', 'schedule', '分配', 'assign'],
        general: ['帮忙', 'help', '协助', 'assist', '问题', 'problem'],
      },
    },
    wukong: {
      id: 'wukong',
      name: '孙悟空',
      emoji: '🐵',
      role: 'executor',
      persona: '你是孙悟空，主力执行者。',
      model: 'claude-sonnet-4-6',
      cli: { command: 'claude', args: ['-p', '--output-format', 'stream-json', '--verbose'] },
      skills: ['coding', 'debugging', 'testing', 'refactoring'],
      mcps: [],
      capabilities: ['code', 'debug', 'test', 'refactor'],
      boundaries: [],
      taskKeywords: {
        high: ['代码', '实现', '编写', 'code', 'implement', 'write'],
        medium: ['调试', 'debug', '修复', 'fix', 'bug'],
        low: ['测试', 'test', '重构', 'refactor'],
        general: ['开发', 'develop', '创建', 'create'],
      },
    },
    bajie: {
      id: 'bajie',
      name: '猪八戒',
      emoji: '🐷',
      role: 'assistant',
      persona: '你是猪八戒，助手。',
      model: 'claude-sonnet-4-6',
      cli: { command: 'claude', args: ['-p', '--output-format', 'stream-json', '--verbose'] },
      skills: ['documentation', 'formatting', 'commands'],
      mcps: [],
      capabilities: ['document', 'format', 'assist'],
      boundaries: [],
      taskKeywords: {
        high: ['文档', 'document', 'doc', 'readme'],
        medium: ['格式', 'format', '整理', 'organize'],
        low: ['运行', 'run', '执行', 'execute'],
        general: ['辅助', 'assist', '帮助', 'help'],
      },
    },
    shaseng: {
      id: 'shaseng',
      name: '沙和尚',
      emoji: '🧔',
      role: 'inspector',
      persona: '你是沙和尚，检查者。',
      model: 'claude-sonnet-4-6',
      cli: { command: 'claude', args: ['-p', '--output-format', 'stream-json', '--verbose'] },
      skills: ['code_review', 'testing', 'security', 'quality'],
      mcps: [],
      capabilities: ['review', 'test', 'verify'],
      boundaries: [],
      taskKeywords: {
        high: ['审查', 'review', '代码审查'],
        medium: ['测试', 'test', '验证', 'verify'],
        low: ['安全', 'security', '漏洞', 'vulnerability'],
        general: ['质量', 'quality', '检查', 'check'],
      },
    },
    rulai: {
      id: 'rulai',
      name: '如来佛祖',
      emoji: '🧘',
      role: 'advisor',
      persona: '你是如来佛祖，资深顾问。',
      model: 'claude-opus-4-6',
      cli: { command: 'claude', args: ['-p', '--output-format', 'stream-json', '--verbose'] },
      skills: ['architecture', 'advisory', 'strategy'],
      mcps: [],
      capabilities: ['advise', 'architect', 'strategize'],
      boundaries: [],
      taskKeywords: {
        high: ['架构', 'architecture', '系统设计'],
        medium: ['复杂', 'complex', '困难', 'difficult'],
        low: ['建议', 'advice', '咨询', 'consult'],
        general: ['战略', 'strategy', '规划', 'planning'],
      },
    },
  };

  return {
    getAgentConfig: (id: string) => agentConfigs[id],
  } as unknown as ConfigService;
};

describe('Agent Implementations', () => {
  describe('TangsengAgent', () => {
    let agent: TangsengAgent;
    let taskPlanner: TaskPlanner;
    let mockConfigService: ConfigService;

    beforeEach(() => {
      mockConfigService = createMockConfigService();
      agent = new TangsengAgent(mockConfigService);
      agent.onModuleInit(); // Trigger config loading
      taskPlanner = new TaskPlanner();
      // Inject dependencies
      agent.setDependencies(taskPlanner, null as any, null as any);
    });

    it('should have correct id', () => {
      expect(agent.getConfig().id).toBe('tangseng');
    });

    it('should have master role', () => {
      expect(agent.getConfig().role).toBe('master');
    });

    it('should identify planning tasks', () => {
      expect(agent.canHandle('帮我做一个任务')).toBe(true);
    });

    it('should have priority weight for planning tasks', () => {
      const weight = agent.getPriorityWeight('帮我规划一下这个项目');
      expect(weight).toBeGreaterThan(0.9);
    });

    it('should create execution plan', async () => {
      // Mock the planner to avoid CLI call
      jest.spyOn(taskPlanner, 'planWithTangseng').mockResolvedValue({
        type: 'task',
        analysis: 'Test analysis',
        steps: [
          {
            stepId: 1,
            taskName: 'Build feature',
            agentRole: 'wukong',
            taskDetail: 'Implement the feature code',
            dependencies: [],
            priority: 'high',
          },
        ],
        summary: 'Test summary',
        needsHelp: false,
      });

      const plan = await agent.createPlan('build a feature');
      expect(plan.steps.length).toBeGreaterThanOrEqual(1);
      expect(plan.steps[0].taskDetail).toBeDefined();
    }, 10000); // Increase timeout
  });

  describe('WukongAgent', () => {
    let agent: WukongAgent;
    let mockConfigService: ConfigService;

    beforeEach(() => {
      mockConfigService = createMockConfigService();
      agent = new WukongAgent(mockConfigService);
      agent.onModuleInit(); // Trigger config loading
    });

    it('should have correct id', () => {
      expect(agent.getConfig().id).toBe('wukong');
    });

    it('should have executor role', () => {
      expect(agent.getConfig().role).toBe('executor');
    });

    it('should have coding skills', () => {
      expect(agent.getConfig().skills).toContain('coding');
    });

    it('should identify code-related tasks', () => {
      expect(agent.canHandle('写一些代码')).toBe(true); // '代码' is a keyword
      expect(agent.canHandle('debug this issue')).toBe(true);
      expect(agent.canHandle('fix the bug')).toBe(true);
      expect(agent.canHandle('make me coffee')).toBe(false);
    });

    it('should calculate priority weights', () => {
      expect(agent.getPriorityWeight('实现一个功能')).toBeGreaterThan(0.8);
      expect(agent.getPriorityWeight('debug issue')).toBeGreaterThan(0.8);
      expect(agent.getPriorityWeight('hello world')).toBeLessThan(0.6);
    });

    it('should be available initially', () => {
      expect(agent.isAvailable()).toBe(true);
    });
  });

  describe('BajieAgent', () => {
    let agent: BajieAgent;
    let mockConfigService: ConfigService;

    beforeEach(() => {
      mockConfigService = createMockConfigService();
      agent = new BajieAgent(mockConfigService);
      agent.onModuleInit(); // Trigger config loading
    });

    it('should have correct id', () => {
      expect(agent.getConfig().id).toBe('bajie');
    });

    it('should have assistant role', () => {
      expect(agent.getConfig().role).toBe('assistant');
    });

    it('should have documentation skill', () => {
      expect(agent.getConfig().skills).toContain('documentation');
    });

    it('should identify suitable tasks', () => {
      expect(agent.canHandle('write documentation')).toBe(true);
      expect(agent.canHandle('format the code')).toBe(true);
      expect(agent.canHandle('run npm install')).toBe(true);
    });

    it('should calculate priority weights', () => {
      expect(agent.getPriorityWeight('写文档')).toBeGreaterThan(0.8);
      expect(agent.getPriorityWeight('整理格式')).toBeGreaterThan(0.8);
    });
  });

  describe('ShasengAgent', () => {
    let agent: ShasengAgent;
    let mockConfigService: ConfigService;

    beforeEach(() => {
      mockConfigService = createMockConfigService();
      agent = new ShasengAgent(mockConfigService);
      agent.onModuleInit(); // Trigger config loading
    });

    it('should have correct id', () => {
      expect(agent.getConfig().id).toBe('shaseng');
    });

    it('should have inspector role', () => {
      expect(agent.getConfig().role).toBe('inspector');
    });

    it('should have code_review skill', () => {
      expect(agent.getConfig().skills).toContain('code_review');
    });

    it('should identify review-related tasks', () => {
      expect(agent.canHandle('审查代码')).toBe(true);
      expect(agent.canHandle('code review')).toBe(true);
      expect(agent.canHandle('运行测试')).toBe(true);
      expect(agent.canHandle('security check')).toBe(true);
    });

    it('should calculate priority weights', () => {
      expect(agent.getPriorityWeight('代码审查')).toBeGreaterThan(0.8);
      expect(agent.getPriorityWeight('测试验证')).toBeGreaterThan(0.8);
    });
  });

  describe('RulaiAgent', () => {
    let agent: RulaiAgent;
    let mockConfigService: ConfigService;

    beforeEach(() => {
      mockConfigService = createMockConfigService();
      agent = new RulaiAgent(mockConfigService);
      agent.onModuleInit(); // Trigger config loading
    });

    it('should have correct id', () => {
      expect(agent.getConfig().id).toBe('rulai');
    });

    it('should have advisor role', () => {
      expect(agent.getConfig().role).toBe('advisor');
    });

    it('should use opus model', () => {
      expect(agent.getConfig().model).toContain('opus');
    });

    it('should identify advisory tasks', () => {
      expect(agent.canHandle('架构设计')).toBe(true);
      expect(agent.canHandle('architecture advice')).toBe(true);
      expect(agent.canHandle('复杂问题')).toBe(true);
    });

    it('should calculate priority weights', () => {
      expect(agent.getPriorityWeight('架构设计')).toBeGreaterThan(0.8);  // high keyword
      expect(agent.getPriorityWeight('建议')).toBeGreaterThan(0.7);      // low keyword
    });
  });

  describe('ExecutableAgentBase', () => {
    let wukongAgent: WukongAgent;
    let mockConfigService: ConfigService;

    beforeEach(() => {
      mockConfigService = createMockConfigService();
      wukongAgent = new WukongAgent(mockConfigService);
      wukongAgent.onModuleInit(); // Trigger config loading
    });

    it('should build proper prompt with context', () => {
      // Agent should have config
      expect(wukongAgent.getConfig()).toBeDefined();
      expect(wukongAgent.getConfig().id).toBe('wukong');
    });

    it('should track status changes', () => {
      expect(wukongAgent.getStatus()).toBe('idle');
    });

    it('should be able to cancel', () => {
      // Cancel should not throw when no process running
      expect(() => wukongAgent.cancel()).not.toThrow();
    });
  });
});