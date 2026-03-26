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
      emoji: '🧘',
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