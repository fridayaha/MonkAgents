import { AgentBase, AgentExecutionResult } from './agent-base';
import { AgentConfig, AgentRole } from '@monkagents/shared';

// Create a concrete test class
class TestAgent extends AgentBase {
  constructor(config: AgentConfig) {
    super(config);
  }

  async analyze(prompt: string): Promise<string> {
    this.status = 'thinking';
    const result = `[TestAgent] Analyzing: ${prompt}`;
    this.status = 'idle';
    return result;
  }

  async execute(task: string): Promise<AgentExecutionResult> {
    this.status = 'executing';
    const result = {
      success: true,
      output: `[TestAgent] Executed: ${task}`,
    };
    this.status = 'idle';
    return result;
  }
}

describe('AgentBase', () => {
  let agent: TestAgent;
  const testConfig: AgentConfig = {
    id: 'test-agent',
    name: 'Test Agent',
    emoji: '🤖',
    role: 'executor' as AgentRole,
    persona: 'I am a test agent',
    model: 'claude-sonnet-4-6',
    cli: {
      command: 'echo',
      args: ['test'],
    },
    skills: ['testing'],
    mcps: [],
    capabilities: ['test'],
    boundaries: [],
  };

  beforeEach(() => {
    agent = new TestAgent(testConfig);
  });

  describe('getConfig', () => {
    it('should return agent config', () => {
      const config = agent.getConfig();
      expect(config.id).toBe('test-agent');
      expect(config.name).toBe('Test Agent');
      expect(config.role).toBe('executor');
    });
  });

  describe('getStatus', () => {
    it('should return initial status as idle', () => {
      expect(agent.getStatus()).toBe('idle');
    });

    it('should reset status after analysis', async () => {
      await agent.analyze('test');
      expect(agent.getStatus()).toBe('idle');
    });

    it('should reset status after execution', async () => {
      await agent.execute('test');
      expect(agent.getStatus()).toBe('idle');
    });
  });

  describe('getState', () => {
    it('should return complete agent state', () => {
      const state = agent.getState();
      expect(state.id).toBe('test-agent');
      expect(state.config).toEqual(testConfig);
      expect(state.status).toBe('idle');
      expect(state.lastActivity).toBeInstanceOf(Date);
    });
  });

  describe('setWorkingDirectory', () => {
    it('should set working directory', () => {
      agent.setWorkingDirectory('/test/path');
      // Working directory is used internally
    });
  });

  describe('analyze', () => {
    it('should analyze prompt and return result', async () => {
      const result = await agent.analyze('test prompt');
      expect(result).toContain('Analyzing: test prompt');
    });

    it('should reset status after analysis', async () => {
      await agent.analyze('test');
      expect(agent.getStatus()).toBe('idle');
    });
  });

  describe('execute', () => {
    it('should execute task and return result', async () => {
      const result = await agent.execute('test task');
      expect(result.success).toBe(true);
      expect(result.output).toContain('Executed: test task');
    });

    it('should reset status after execution', async () => {
      await agent.execute('test');
      expect(agent.getStatus()).toBe('idle');
    });
  });

  describe('cancel', () => {
    it('should be callable without error', () => {
      expect(() => agent.cancel()).not.toThrow();
    });

    it('should set status to idle', () => {
      agent.cancel();
      expect(agent.getStatus()).toBe('idle');
    });
  });

  describe('isAvailable', () => {
    it('should return true when idle', () => {
      expect(agent.isAvailable()).toBe(true);
    });
  });

  describe('getPersonaPrompt', () => {
    it('should return persona string', () => {
      expect(agent.getPersonaPrompt()).toBe('I am a test agent');
    });
  });
});