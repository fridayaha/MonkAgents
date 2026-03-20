import { Test, TestingModule } from '@nestjs/testing';
import { CliService } from './cli.service';
import { ConfigService } from '../config/config.service';
import { AgentConfig } from '@monkagents/shared';

describe('CliService', () => {
  let service: CliService;
  let configService: ConfigService;

  const mockAgentConfig: AgentConfig = {
    id: 'test-agent',
    name: 'Test Agent',
    emoji: '🤖',
    role: 'executor',
    persona: 'Test persona',
    model: 'claude-sonnet-4-6',
    cli: {
      command: 'echo',
      args: ['test'],
    },
    skills: [],
    mcps: [],
    capabilities: [],
    boundaries: [],
  };

  const mockConfigService = {
    getAgentConfig: jest.fn().mockReturnValue(mockAgentConfig),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CliService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<CliService>(CliService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('execute', () => {
    it('should throw error if agent config not found', async () => {
      mockConfigService.getAgentConfig.mockReturnValueOnce(null);

      await expect(service.execute('unknown-agent', 'test')).rejects.toThrow(
        'Agent configuration not found: unknown-agent',
      );
    });

    it('should get agent config when executing', async () => {
      // Use echo command for quick test
      mockConfigService.getAgentConfig.mockReturnValueOnce({
        ...mockAgentConfig,
        cli: {
          command: 'echo',
          args: [],
        },
      });

      // This will fail because echo doesn't output JSON, but we can test the flow
      try {
        await service.execute('test-agent', 'hello', { timeout: 1000 });
      } catch {
        // Expected to fail or timeout
      }

      expect(configService.getAgentConfig).toHaveBeenCalledWith('test-agent');
    }, 10000);
  });

  describe('cancel', () => {
    it('should return false if no session for agent', () => {
      expect(service.cancel('unknown-agent')).toBe(false);
    });
  });

  describe('getActiveSessions', () => {
    it('should return empty array when no active sessions', () => {
      expect(service.getActiveSessions()).toEqual([]);
    });
  });

  describe('isAgentExecuting', () => {
    it('should return false if agent has no session', () => {
      expect(service.isAgentExecuting('unknown-agent')).toBe(false);
    });
  });

  describe('getSessionState', () => {
    it('should return null for unknown session', () => {
      expect(service.getSessionState('unknown-session')).toBeNull();
    });
  });

  describe('getAgentSession', () => {
    it('should return null for unknown agent', () => {
      expect(service.getAgentSession('unknown-agent')).toBeNull();
    });
  });
});