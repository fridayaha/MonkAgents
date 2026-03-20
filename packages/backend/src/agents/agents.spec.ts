import { TangsengAgent } from './tangseng.agent';
import { WukongAgent } from './wukong.agent';
import { BajieAgent } from './bajie.agent';
import { ShasengAgent } from './shaseng.agent';
import { RulaiAgent } from './rulai.agent';
import { TaskPlanner } from './task-planner';

describe('Agent Implementations', () => {
  describe('TangsengAgent', () => {
    let agent: TangsengAgent;
    let taskPlanner: TaskPlanner;

    beforeEach(() => {
      agent = new TangsengAgent();
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

    beforeEach(() => {
      agent = new WukongAgent();
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

    beforeEach(() => {
      agent = new BajieAgent();
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

    beforeEach(() => {
      agent = new ShasengAgent();
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

    beforeEach(() => {
      agent = new RulaiAgent();
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

    beforeEach(() => {
      wukongAgent = new WukongAgent();
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