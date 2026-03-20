import { TangsengAgent } from './tangseng.agent';
import { WukongAgent } from './wukong.agent';
import { BajieAgent } from './bajie.agent';
import { ShasengAgent } from './shaseng.agent';
import { RulaiAgent } from './rulai.agent';

describe('Agent Implementations', () => {
  describe('TangsengAgent', () => {
    let agent: TangsengAgent;

    beforeEach(() => {
      agent = new TangsengAgent();
    });

    it('should have correct id', () => {
      expect(agent.getConfig().id).toBe('tangseng');
    });

    it('should have master role', () => {
      expect(agent.getConfig().role).toBe('master');
    });

    it('should analyze prompts', async () => {
      const result = await agent.analyze('test task');
      expect(result).toContain('唐僧');
    });

    it('should execute tasks', async () => {
      const result = await agent.execute('test task');
      expect(result.success).toBe(true);
      expect(result.output).toContain('唐僧');
    });

    it('should create execution plan', async () => {
      const plan = await agent.createPlan('build a feature');
      expect(plan.length).toBeGreaterThan(0);
      expect(plan[0]).toContain('分析');
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

    it('should analyze prompts', async () => {
      const result = await agent.analyze('write code');
      expect(result).toContain('孙悟空');
    });

    it('should execute tasks', async () => {
      const result = await agent.execute('fix bug');
      expect(result.success).toBe(true);
    });

    it('should identify code-related tasks', () => {
      expect(agent.canHandle('写一些代码')).toBe(true); // '代码' is a keyword
      expect(agent.canHandle('debug this issue')).toBe(true);
      expect(agent.canHandle('fix the bug')).toBe(true);
      expect(agent.canHandle('make me coffee')).toBe(false);
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
      expect(agent.isSuitableTask('write documentation')).toBe(true);
      expect(agent.isSuitableTask('format the code')).toBe(true);
      expect(agent.isSuitableTask('refactor architecture')).toBe(false);
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

    it('should review code', async () => {
      const result = await agent.reviewCode('some code');
      expect(result.issues).toBeDefined();
      expect(result.suggestions).toBeDefined();
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

    it('should provide guidance', async () => {
      const guidance = await agent.provideGuidance('architecture question');
      expect(guidance).toBeDefined();
    });
  });
});