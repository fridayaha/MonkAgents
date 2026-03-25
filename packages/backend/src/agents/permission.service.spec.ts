import { Test, TestingModule } from '@nestjs/testing';
import { PermissionService } from './permission.service';
import { ConfigService } from '../config/config.service';
import { RedisService } from '../redis/redis.service';
import { PermissionDenial, AgentConfig, AgentRole } from '@monkagents/shared';

describe('PermissionService', () => {
  let service: PermissionService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockRedisService: jest.Mocked<RedisService>;

  const mockAgentConfig: AgentConfig = {
    id: 'wukong',
    name: '孙悟空',
    emoji: '🐵',
    role: 'executor' as AgentRole,
    persona: 'Test persona',
    model: 'claude-sonnet-4-6',
    cli: { command: 'claude', args: ['-p'] },
    skills: ['coding'],
    mcps: [],
    capabilities: ['code_generation'],
    boundaries: [],
    permissions: {
      autoApprove: ['Read', 'Edit', 'Write', 'Bash(git *)', 'Bash(npm *)'],
    },
  };

  beforeEach(async () => {
    mockConfigService = {
      getAgentConfig: jest.fn(),
      getAllAgentConfigs: jest.fn(),
      getSystemConfig: jest.fn(),
      getRedisConfig: jest.fn(),
    } as any;

    mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      addMessageToHistory: jest.fn(),
      getSessionHistory: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<PermissionService>(PermissionService);
  });

  describe('getAllowedTools', () => {
    it('should return auto-approved tools from config', async () => {
      mockConfigService.getAgentConfig.mockReturnValue(mockAgentConfig);
      mockRedisService.get.mockResolvedValue(null);

      const tools = await service.getAllowedTools('wukong', 'session-123');

      expect(tools).toContain('Read');
      expect(tools).toContain('Edit');
      expect(tools).toContain('Write');
      expect(tools).toContain('Bash(git *)');
    });

    it('should include remembered decisions', async () => {
      mockConfigService.getAgentConfig.mockReturnValue(mockAgentConfig);
      mockRedisService.get.mockResolvedValue(JSON.stringify([
        { pattern: 'WebFetch', action: 'allow', createdAt: new Date().toISOString() },
      ]));

      const tools = await service.getAllowedTools('wukong', 'session-123');

      expect(tools).toContain('WebFetch');
    });

    it('should include tools from agent config', async () => {
      const configWithTools: AgentConfig = {
        ...mockAgentConfig,
        tools: ['Read', 'Glob', 'Grep'],
      };
      mockConfigService.getAgentConfig.mockReturnValue(configWithTools);
      mockRedisService.get.mockResolvedValue(null);

      const tools = await service.getAllowedTools('wukong', 'session-123');

      expect(tools).toContain('Read');
      expect(tools).toContain('Glob');
      expect(tools).toContain('Grep');
    });

    it('should return empty array for unknown agent', async () => {
      mockConfigService.getAgentConfig.mockReturnValue(undefined);

      const tools = await service.getAllowedTools('unknown', 'session-123');

      expect(tools).toEqual([]);
    });
  });

  describe('decide', () => {
    it('should auto-approve when tool matches remembered decision', async () => {
      mockRedisService.get.mockResolvedValue(JSON.stringify([
        { pattern: 'WebFetch', action: 'allow', createdAt: new Date().toISOString() },
      ]));

      const request = {
        id: 'req-1',
        sessionId: 'session-123',
        agentId: 'wukong',
        toolName: 'WebFetch',
        toolCategory: 'network' as const,
        input: { url: 'https://example.com' },
        risk: 'medium' as const,
        timestamp: new Date(),
      };

      const decision = await service.decide(request);

      expect(decision.action).toBe('auto_approve');
    });

    it('should auto-approve when tool matches autoApprove config', async () => {
      mockConfigService.getAgentConfig.mockReturnValue(mockAgentConfig);
      mockRedisService.get.mockResolvedValue(null);

      const request = {
        id: 'req-2',
        sessionId: 'session-123',
        agentId: 'wukong',
        toolName: 'Read',
        toolCategory: 'file_read' as const,
        input: { file_path: '/src/test.ts' },
        risk: 'low' as const,
        timestamp: new Date(),
      };

      const decision = await service.decide(request);

      expect(decision.action).toBe('auto_approve');
    });

    it('should auto-approve Bash commands matching pattern', async () => {
      mockConfigService.getAgentConfig.mockReturnValue(mockAgentConfig);
      mockRedisService.get.mockResolvedValue(null);

      const request = {
        id: 'req-3',
        sessionId: 'session-123',
        agentId: 'wukong',
        toolName: 'Bash',
        toolCategory: 'bash_safe' as const,
        input: { command: 'git status' },
        risk: 'low' as const,
        timestamp: new Date(),
      };

      const decision = await service.decide(request);

      expect(decision.action).toBe('auto_approve');
    });

    it('should ask user when no rule matches', async () => {
      mockConfigService.getAgentConfig.mockReturnValue(mockAgentConfig);
      mockRedisService.get.mockResolvedValue(null);

      const request = {
        id: 'req-4',
        sessionId: 'session-123',
        agentId: 'wukong',
        toolName: 'Bash',
        toolCategory: 'bash_dangerous' as const,
        input: { command: 'rm -rf /important' },
        risk: 'high' as const,
        timestamp: new Date(),
      };

      const decision = await service.decide(request);

      expect(decision.action).toBe('ask_user');
    });

    it('should auto-deny when remembered decision is deny', async () => {
      mockRedisService.get.mockResolvedValue(JSON.stringify([
        { pattern: 'Bash(rm *)', action: 'deny', createdAt: new Date().toISOString() },
      ]));

      const request = {
        id: 'req-5',
        sessionId: 'session-123',
        agentId: 'wukong',
        toolName: 'Bash',
        toolCategory: 'bash_dangerous' as const,
        input: { command: 'rm -rf test' },
        risk: 'high' as const,
        timestamp: new Date(),
      };

      const decision = await service.decide(request);

      expect(decision.action).toBe('auto_deny');
    });
  });

  describe('categorizeTool', () => {
    it('should categorize Read as file_read', () => {
      const category = service.categorizeTool('Read', { file_path: '/test.ts' });
      expect(category).toBe('file_read');
    });

    it('should categorize Write as file_write', () => {
      const category = service.categorizeTool('Write', { file_path: '/test.ts', content: '' });
      expect(category).toBe('file_write');
    });

    it('should categorize WebFetch as network', () => {
      const category = service.categorizeTool('WebFetch', { url: 'https://example.com' });
      expect(category).toBe('network');
    });

    it('should categorize safe Bash commands as bash_safe', () => {
      const category = service.categorizeTool('Bash', { command: 'git status' });
      expect(category).toBe('bash_safe');
    });

    it('should categorize dangerous Bash commands as bash_dangerous', () => {
      const category = service.categorizeTool('Bash', { command: 'rm -rf /test' });
      expect(category).toBe('bash_dangerous');
    });

    it('should categorize sudo commands as bash_dangerous', () => {
      const category = service.categorizeTool('Bash', { command: 'sudo apt install' });
      expect(category).toBe('bash_dangerous');
    });

    it('should categorize Agent as agent', () => {
      const category = service.categorizeTool('Agent', { agent_id: 'wukong' });
      expect(category).toBe('agent');
    });

    it('should categorize unknown tools as other', () => {
      const category = service.categorizeTool('UnknownTool', {});
      expect(category).toBe('other');
    });
  });

  describe('assessRisk', () => {
    it('should assess bash_dangerous as high risk', () => {
      const request = {
        id: 'req-1',
        sessionId: 'session-123',
        agentId: 'wukong',
        toolName: 'Bash',
        toolCategory: 'bash_dangerous' as const,
        input: { command: 'rm -rf /' },
        risk: 'medium' as const,
        timestamp: new Date(),
      };

      const risk = service.assessRisk(request);
      expect(risk).toBe('high');
    });

    it('should assess file_write as medium risk', () => {
      const request = {
        id: 'req-2',
        sessionId: 'session-123',
        agentId: 'wukong',
        toolName: 'Write',
        toolCategory: 'file_write' as const,
        input: { file_path: '/test.ts' },
        risk: 'medium' as const,
        timestamp: new Date(),
      };

      const risk = service.assessRisk(request);
      expect(risk).toBe('medium');
    });

    it('should assess file_read as low risk', () => {
      const request = {
        id: 'req-3',
        sessionId: 'session-123',
        agentId: 'wukong',
        toolName: 'Read',
        toolCategory: 'file_read' as const,
        input: { file_path: '/test.ts' },
        risk: 'low' as const,
        timestamp: new Date(),
      };

      const risk = service.assessRisk(request);
      expect(risk).toBe('low');
    });

    it('should assess https network as medium risk', () => {
      const request = {
        id: 'req-4',
        sessionId: 'session-123',
        agentId: 'wukong',
        toolName: 'WebFetch',
        toolCategory: 'network' as const,
        input: { url: 'https://example.com' },
        risk: 'medium' as const,
        timestamp: new Date(),
      };

      const risk = service.assessRisk(request);
      expect(risk).toBe('medium');
    });

    it('should assess http network as high risk', () => {
      const request = {
        id: 'req-5',
        sessionId: 'session-123',
        agentId: 'wukong',
        toolName: 'WebFetch',
        toolCategory: 'network' as const,
        input: { url: 'http://example.com' },
        risk: 'medium' as const,
        timestamp: new Date(),
      };

      const risk = service.assessRisk(request);
      expect(risk).toBe('high');
    });
  });

  describe('saveDecision', () => {
    it('should save decision to Redis', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockRedisService.set.mockResolvedValue(undefined);

      await service.saveDecision('session-123', 'WebFetch', 'allow');

      expect(mockRedisService.set).toHaveBeenCalled();
    });

    it('should update existing decision', async () => {
      mockRedisService.get.mockResolvedValue(JSON.stringify([
        { pattern: 'WebFetch', action: 'deny', createdAt: new Date().toISOString() },
      ]));
      mockRedisService.set.mockResolvedValue(undefined);

      await service.saveDecision('session-123', 'WebFetch', 'allow');

      expect(mockRedisService.set).toHaveBeenCalled();
    });
  });

  describe('createRequestFromDenial', () => {
    it('should create permission request from denial', () => {
      const denial: PermissionDenial = {
        tool_name: 'WebFetch',
        tool_use_id: 'tool-123',
        tool_input: { url: 'https://example.com' },
      };

      const request = service.createRequestFromDenial(denial, 'session-123', 'wukong');

      expect(request.toolName).toBe('WebFetch');
      expect(request.sessionId).toBe('session-123');
      expect(request.agentId).toBe('wukong');
      expect(request.toolCategory).toBe('network');
    });
  });

  describe('getRememberedDecisions', () => {
    it('should return remembered decisions from Redis', async () => {
      const decisions = [
        { pattern: 'WebFetch', action: 'allow', createdAt: new Date().toISOString() },
      ];
      mockRedisService.get.mockResolvedValue(JSON.stringify(decisions));

      const result = await service.getRememberedDecisions('session-123');

      expect(result).toHaveLength(1);
      expect(result[0].pattern).toBe('WebFetch');
    });

    it('should return empty array when no decisions', async () => {
      mockRedisService.get.mockResolvedValue(null);

      const result = await service.getRememberedDecisions('session-123');

      expect(result).toEqual([]);
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisService.get.mockRejectedValue(new Error('Redis error'));

      const result = await service.getRememberedDecisions('session-123');

      expect(result).toEqual([]);
    });
  });
});