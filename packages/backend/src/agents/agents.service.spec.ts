import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AgentsService } from './agents.service';
import { Agent } from '../database/entities/agent.entity';
import { ConfigService } from '../config/config.service';
import { AgentStatus, AgentRole } from '@monkagents/shared';
import { WukongAgent } from './wukong.agent';
import { BajieAgent } from './bajie.agent';
import { ShasengAgent } from './shaseng.agent';
import { RulaiAgent } from './rulai.agent';

describe('AgentsService', () => {
  let service: AgentsService;

  const mockAgentConfig = {
    id: 'wukong',
    name: '孙悟空',
    emoji: '🐵',
    role: 'executor' as AgentRole,
    persona: 'Test persona',
    model: 'claude-sonnet-4-6',
    cli: {
      command: 'claude',
      args: ['-p'],
    },
    skills: ['coding'],
    mcps: [],
    capabilities: ['code_generation'],
    boundaries: [],
  };

  const mockAgent: Partial<Agent> = {
    id: 'uuid-1',
    agentId: 'wukong',
    name: '孙悟空',
    emoji: '🐵',
    role: 'executor',
    persona: 'Test',
    model: 'claude-sonnet-4-6',
    status: 'idle' as AgentStatus,
  };

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const mockConfigService = {
    getAllAgentConfigs: jest.fn(),
    getAgentConfig: jest.fn(),
  };

  // Mock agent instances
  const mockWukongAgent = {
    canHandle: jest.fn().mockReturnValue(true),
    getPriorityWeight: jest.fn().mockReturnValue(0.9),
    isAvailable: jest.fn().mockReturnValue(true),
    getConfig: jest.fn().mockReturnValue(mockAgentConfig),
    getStatus: jest.fn().mockReturnValue('idle'),
  };

  const mockBajieAgent = {
    canHandle: jest.fn().mockReturnValue(false),
    getPriorityWeight: jest.fn().mockReturnValue(0.5),
    isAvailable: jest.fn().mockReturnValue(true),
    getConfig: jest.fn().mockReturnValue({ ...mockAgentConfig, id: 'bajie' }),
    getStatus: jest.fn().mockReturnValue('idle'),
  };

  const mockShasengAgent = {
    canHandle: jest.fn().mockReturnValue(false),
    getPriorityWeight: jest.fn().mockReturnValue(0.5),
    isAvailable: jest.fn().mockReturnValue(true),
    getConfig: jest.fn().mockReturnValue({ ...mockAgentConfig, id: 'shaseng' }),
    getStatus: jest.fn().mockReturnValue('idle'),
  };

  const mockRulaiAgent = {
    canHandle: jest.fn().mockReturnValue(false),
    getPriorityWeight: jest.fn().mockReturnValue(0.3),
    isAvailable: jest.fn().mockReturnValue(true),
    getConfig: jest.fn().mockReturnValue({ ...mockAgentConfig, id: 'rulai' }),
    getStatus: jest.fn().mockReturnValue('idle'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentsService,
        {
          provide: getRepositoryToken(Agent),
          useValue: mockRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: WukongAgent,
          useValue: mockWukongAgent,
        },
        {
          provide: BajieAgent,
          useValue: mockBajieAgent,
        },
        {
          provide: ShasengAgent,
          useValue: mockShasengAgent,
        },
        {
          provide: RulaiAgent,
          useValue: mockRulaiAgent,
        },
      ],
    }).compile();

    service = module.get<AgentsService>(AgentsService);
  });

  describe('onModuleInit', () => {
    it('should initialize agents from config', async () => {
      mockConfigService.getAllAgentConfigs.mockReturnValue([mockAgentConfig]);
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(mockAgent);
      mockRepository.save.mockResolvedValue(mockAgent);

      await service.onModuleInit();

      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should not create new agent if already exists', async () => {
      mockConfigService.getAllAgentConfigs.mockReturnValue([mockAgentConfig]);
      mockRepository.findOne.mockResolvedValue(mockAgent);

      await service.onModuleInit();

      expect(mockRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('getAllAgents', () => {
    it('should return all agent states', async () => {
      mockConfigService.getAllAgentConfigs.mockReturnValue([mockAgentConfig]);
      mockRepository.findOne.mockResolvedValue(mockAgent);

      await service.onModuleInit();
      const agents = await service.getAllAgents();

      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe('wukong');
    });
  });

  describe('getAgent', () => {
    it('should return agent state by id', async () => {
      mockConfigService.getAllAgentConfigs.mockReturnValue([mockAgentConfig]);
      mockRepository.findOne.mockResolvedValue(mockAgent);

      await service.onModuleInit();
      const agent = await service.getAgent('wukong');

      expect(agent).toBeDefined();
      expect(agent?.id).toBe('wukong');
    });

    it('should return undefined for non-existent agent', async () => {
      mockConfigService.getAllAgentConfigs.mockReturnValue([]);

      await service.onModuleInit();
      const agent = await service.getAgent('non-existent');

      expect(agent).toBeUndefined();
    });
  });

  describe('updateAgentStatus', () => {
    it('should update agent status', async () => {
      mockConfigService.getAllAgentConfigs.mockReturnValue([mockAgentConfig]);
      mockRepository.findOne.mockResolvedValue(mockAgent);
      mockRepository.update.mockResolvedValue(undefined);

      await service.onModuleInit();
      await service.updateAgentStatus('wukong', 'thinking' as AgentStatus);

      const agent = await service.getAgent('wukong');
      expect(agent?.status).toBe('thinking');
      expect(mockRepository.update).toHaveBeenCalled();
    });
  });

  describe('assignTask', () => {
    it('should assign task to agent', async () => {
      mockConfigService.getAllAgentConfigs.mockReturnValue([mockAgentConfig]);
      mockRepository.findOne.mockResolvedValue(mockAgent);
      mockRepository.update.mockResolvedValue(undefined);

      await service.onModuleInit();
      await service.assignTask('wukong', 'task-123');

      const agent = await service.getAgent('wukong');
      expect(agent?.currentTaskId).toBe('task-123');
      expect(agent?.status).toBe('thinking');
    });
  });

  describe('releaseAgent', () => {
    it('should release agent from task', async () => {
      mockConfigService.getAllAgentConfigs.mockReturnValue([mockAgentConfig]);
      mockRepository.findOne.mockResolvedValue(mockAgent);
      mockRepository.update.mockResolvedValue(undefined);

      await service.onModuleInit();
      await service.assignTask('wukong', 'task-123');
      await service.releaseAgent('wukong');

      const agent = await service.getAgent('wukong');
      expect(agent?.currentTaskId).toBeUndefined();
      expect(agent?.status).toBe('idle');
    });
  });

  describe('getAvailableAgents', () => {
    it('should return only idle agents', async () => {
      const config2 = { ...mockAgentConfig, id: 'bajie', role: 'assistant' as AgentRole };
      mockConfigService.getAllAgentConfigs.mockReturnValue([mockAgentConfig, config2]);
      mockRepository.findOne.mockResolvedValue(mockAgent);

      await service.onModuleInit();
      await service.updateAgentStatus('wukong', 'executing' as AgentStatus);

      const available = await service.getAvailableAgents();
      expect(available.length).toBe(1);
      expect(available[0].id).toBe('bajie');
    });
  });

  describe('selectBestAgent', () => {
    it('should select the best agent for a task', async () => {
      mockConfigService.getAllAgentConfigs.mockReturnValue([mockAgentConfig]);
      mockRepository.findOne.mockResolvedValue(mockAgent);

      await service.onModuleInit();

      mockWukongAgent.canHandle.mockReturnValue(true);
      mockWukongAgent.getPriorityWeight.mockReturnValue(0.9);
      mockBajieAgent.canHandle.mockReturnValue(false);

      const result = service.selectBestAgent('写代码实现功能');

      expect(result.agentId).toBe('wukong');
      expect(result.weight).toBe(0.9);
    });

    it('should default to wukong when no agent matches', async () => {
      mockConfigService.getAllAgentConfigs.mockReturnValue([mockAgentConfig]);
      mockRepository.findOne.mockResolvedValue(mockAgent);

      await service.onModuleInit();

      mockWukongAgent.canHandle.mockReturnValue(false);
      mockBajieAgent.canHandle.mockReturnValue(false);
      mockShasengAgent.canHandle.mockReturnValue(false);
      mockRulaiAgent.canHandle.mockReturnValue(false);

      const result = service.selectBestAgent('随机任务');

      expect(result.agentId).toBe('wukong');
      expect(result.weight).toBe(0.5);
    });
  });

  describe('getExecutableAgent', () => {
    it('should return the executable agent instance', async () => {
      mockConfigService.getAllAgentConfigs.mockReturnValue([mockAgentConfig]);
      mockRepository.findOne.mockResolvedValue(mockAgent);

      await service.onModuleInit();

      const agent = service.getExecutableAgent('wukong');
      expect(agent).toBe(mockWukongAgent);
    });

    it('should return undefined for unknown agent', async () => {
      mockConfigService.getAllAgentConfigs.mockReturnValue([]);

      await service.onModuleInit();

      const agent = service.getExecutableAgent('unknown');
      expect(agent).toBeUndefined();
    });
  });

  describe('getAgentsStatusSummary', () => {
    it('should return status summary for all agents', async () => {
      mockConfigService.getAllAgentConfigs.mockReturnValue([mockAgentConfig]);
      mockRepository.findOne.mockResolvedValue(mockAgent);

      await service.onModuleInit();

      const summary = service.getAgentsStatusSummary();

      expect(summary['wukong']).toBeDefined();
      expect(summary['wukong'].status).toBe('idle');
      expect(summary['wukong'].available).toBe(true);
    });
  });
});