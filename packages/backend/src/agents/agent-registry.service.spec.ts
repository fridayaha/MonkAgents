import { Test, TestingModule } from '@nestjs/testing';
import { AgentRegistry } from './agent-registry.service';
import { ConfigService } from '../config/config.service';
import { ExecutableAgentBase } from './executable-agent-base';
import { AgentConfig } from '@monkagents/shared';

// Mock agent for testing
class MockAgent extends ExecutableAgentBase {
  constructor(config: AgentConfig) {
    super(config);
  }

  async execute(): Promise<any> {
    return { success: true };
  }

  cancel(): void {}
  isAvailable(): boolean { return true; }
}

describe('AgentRegistry', () => {
  let service: AgentRegistry;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentRegistry,
        {
          provide: ConfigService,
          useValue: {
            getAllAgentConfigs: jest.fn().mockReturnValue([
              {
                id: 'test-agent',
                name: 'Test Agent',
                emoji: '🤖',
                role: 'executor',
                persona: 'A test agent',
                model: 'test-model',
                cli: {
                  command: 'test',
                  args: ['--test'],
                },
                skills: [],
                mcps: [],
                capabilities: ['testing'],
                boundaries: [],
              }
            ]),
            getAgentConfig: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AgentRegistry>(AgentRegistry);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should register an agent', () => {
    const mockAgent = new MockAgent({
      id: 'test-agent',
      name: 'Test Agent',
      emoji: '🤖',
      role: 'executor',
      persona: 'A test agent',
      model: 'test-model',
      cli: {
        command: 'test',
        args: ['--test'],
      },
      skills: [],
      mcps: [],
      capabilities: ['testing'],
      boundaries: [],
    });

    service.registerAgent(mockAgent);

    expect(service.getAgent('test-agent')).toBeDefined();
  });

  it('should get an agent by ID', () => {
    const mockAgent = new MockAgent({
      id: 'another-agent',
      name: 'Another Agent',
      emoji: '🤖',
      role: 'executor',
      persona: 'A test agent',
      model: 'test-model',
      cli: {
        command: 'test',
        args: ['--test'],
      },
      skills: [],
      mcps: [],
      capabilities: ['testing'],
      boundaries: [],
    });

    service.registerAgent(mockAgent);

    const retrievedAgent = service.getAgent('another-agent');
    expect(retrievedAgent).toBeDefined();
    expect(retrievedAgent?.getId()).toBe('another-agent');
  });

  it('should return all agents', () => {
    const mockAgent1 = new MockAgent({
      id: 'agent-1',
      name: 'Agent 1',
      emoji: '🤖',
      role: 'executor',
      persona: 'A test agent',
      model: 'test-model',
      cli: {
        command: 'test',
        args: ['--test'],
      },
      skills: [],
      mcps: [],
      capabilities: ['testing'],
      boundaries: [],
    });

    const mockAgent2 = new MockAgent({
      id: 'agent-2',
      name: 'Agent 2',
      emoji: '🤖',
      role: 'executor',
      persona: 'A test agent',
      model: 'test-model',
      cli: {
        command: 'test',
        args: ['--test'],
      },
      skills: [],
      mcps: [],
      capabilities: ['testing'],
      boundaries: [],
    });

    service.registerAgent(mockAgent1);
    service.registerAgent(mockAgent2);

    const allAgents = service.getAllAgents();
    expect(allAgents.length).toBeGreaterThanOrEqual(2);
  });

  it('should return undefined for non-existent agent', () => {
    const agent = service.getAgent('non-existent');
    expect(agent).toBeUndefined();
  });
});