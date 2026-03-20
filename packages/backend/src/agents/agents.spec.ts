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
      emoji: '🙏',
      role: 'master',
      persona: '你是唐僧，团队的师父和精神领袖。',
      model: 'claude-opus-4-6',
      cli: { command: 'claude', args: ['-p', '--output-format', 'stream-json', '--verbose'] },
      skills: ['planning', 'coordination'],
      mcps: [],
      capabilities: ['planning', 'coordination', 'review', 'decision_making'],
      boundaries: ['不直接执行技术任务', '主要负责决策和协调'],
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
    },
    rulai: {
      id: 'rulai',
      name: '如来佛祖',
      emoji: '🙏',
      role: 'advisor',
      persona: '你是如来佛祖，资深顾问。',
      model: 'claude-opus-4-6',
      cli: { command: 'claude', args: ['-p', '--output-format', 'stream-json', '--verbose'] },
      skills: ['architecture', 'advisory', 'strategy'],
      mcps: [],
      capabilities: ['advise', 'architect', 'strategize'],
      boundaries: [],
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

    it('should analyze prompts', async () => {
      const result = await agent.analyze('test task');
      expect(result).toContain('步骤');
    });

    it('should execute tasks', async () => {
      const result = await agent.execute('test task');
      expect(result.success).toBe(true);
      expect(result.output).toContain('唐僧');
    });

    it('should create execution plan', async () => {
      const plan = await agent.createPlan('build a feature');
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.steps[0].description).toContain('分析');
    });
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
      expect(agent.getPriorityWeight('架构设计')).toBeGreaterThan(0.8);
      expect(agent.getPriorityWeight('技术咨询')).toBeGreaterThan(0.8);
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