import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AgentsService } from './agents.service';
import { Agent } from '../database/entities/agent.entity';
import { ConfigService } from '../config/config.service';
import { AgentStatus, AgentRole } from '@monkagents/shared';

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
});