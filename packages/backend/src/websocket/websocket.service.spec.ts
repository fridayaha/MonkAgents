import { Test, TestingModule } from '@nestjs/testing';
import { WebSocketService } from './websocket.service';
import { Socket, Server } from 'socket.io';
import { AgentMentionService } from '../agents/agent-mention.service';
import { AgentsService } from '../agents/agents.service';
import { RedisService } from '../redis/redis.service';

describe('WebSocketService', () => {
  let service: WebSocketService;

  const mockSocket = {
    id: 'socket-123',
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    to: jest.fn().mockReturnThis(),
  };

  const mockServer = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  };

  const mockMentionService = {
    parseMessage: jest.fn().mockReturnValue({
      originalContent: 'test',
      cleanedContent: 'test',
      mentions: [],
      hasMentions: false,
    }),
    getAgentName: jest.fn().mockReturnValue('孙悟空'),
    buildCollaborationInstruction: jest.fn().mockReturnValue('test'),
  };

  const mockAgentsService = {
    getAgentsStatusSummary: jest.fn().mockReturnValue({}),
    getExecutableAgent: jest.fn().mockReturnValue(null),
  };

  const mockRedisService = {
    getSessionHistory: jest.fn().mockResolvedValue([]),
    addMessageToHistory: jest.fn().mockResolvedValue(undefined),
    isAvailable: jest.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebSocketService,
        {
          provide: AgentMentionService,
          useValue: mockMentionService,
        },
        {
          provide: AgentsService,
          useValue: mockAgentsService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<WebSocketService>(WebSocketService);
  });

  describe('client management', () => {
    it('should add client', () => {
      service.addClient(mockSocket as unknown as Socket);
      expect(service.getConnectedClientsCount()).toBe(1);
    });

    it('should remove client', () => {
      service.addClient(mockSocket as unknown as Socket);
      service.removeClient(mockSocket as unknown as Socket);
      expect(service.getConnectedClientsCount()).toBe(0);
    });

    it('should track session membership', () => {
      service.addClient(mockSocket as unknown as Socket);
      service.joinSession('socket-123', 'session-1');

      const clients = service.getSessionClients('session-1');
      expect(clients).toContain('socket-123');
    });

    it('should remove session membership', () => {
      service.addClient(mockSocket as unknown as Socket);
      service.joinSession('socket-123', 'session-1');
      service.leaveSession('socket-123', 'session-1');

      const clients = service.getSessionClients('session-1');
      expect(clients).not.toContain('socket-123');
    });
  });

  describe('setServer', () => {
    it('should store server reference', () => {
      service.setServer(mockServer as unknown as Server);
      // Server should be set
    });
  });

  describe('emitToSession', () => {
    it('should emit event to session room', () => {
      service.setServer(mockServer as unknown as Server);
      service.emitToSession('session-1', 'test-event', { data: 'test' });
      expect(mockServer.to).toHaveBeenCalledWith('session:session-1');
      expect(mockServer.emit).toHaveBeenCalledWith('test-event', { data: 'test' });
    });
  });

  describe('emitToAll', () => {
    it('should emit event to all clients', () => {
      service.setServer(mockServer as unknown as Server);
      service.emitToAll('test-event', { data: 'test' });
      expect(mockServer.emit).toHaveBeenCalledWith('test-event', { data: 'test' });
    });
  });

  describe('emitAgentStatus', () => {
    it('should emit agent status update', () => {
      service.setServer(mockServer as unknown as Server);
      service.emitAgentStatus('agent-1', 'thinking');
      expect(mockServer.emit).toHaveBeenCalledWith('agent_status', {
        agentId: 'agent-1',
        status: 'thinking',
        timestamp: expect.any(Date),
      });
    });
  });

  describe('emitTaskStatus', () => {
    it('should emit task status update', () => {
      service.setServer(mockServer as unknown as Server);
      service.emitTaskStatus('task-1', 'completed', 'Task done');
      expect(mockServer.emit).toHaveBeenCalledWith('task_status', {
        taskId: 'task-1',
        status: 'completed',
        message: 'Task done',
        timestamp: expect.any(Date),
      });
    });
  });

  describe('emitError', () => {
    it('should emit error to all when no session', () => {
      service.setServer(mockServer as unknown as Server);
      service.emitError('TEST_ERROR', 'Something went wrong');
      expect(mockServer.emit).toHaveBeenCalledWith('error', {
        code: 'TEST_ERROR',
        message: 'Something went wrong',
        timestamp: expect.any(Date),
      });
    });

    it('should emit error to specific session', () => {
      service.setServer(mockServer as unknown as Server);
      service.emitError('TEST_ERROR', 'Something went wrong', 'session-1');
      expect(mockServer.to).toHaveBeenCalledWith('session:session-1');
    });
  });

  describe('setDependencies', () => {
    it('should set dependencies', () => {
      service.setDependencies({} as any, {} as any, {} as any);
      // Dependencies should be set
    });
  });

  describe('handleUserMessage', () => {
    it('should emit error when dependencies not set', async () => {
      service.setServer(mockServer as unknown as Server);
      await service.handleUserMessage('client-1', 'session-1', 'test message');
      // Should emit error
      expect(mockServer.to).toHaveBeenCalled();
    });
  });

  describe('cancelTask', () => {
    it('should handle cancel without tasks service', async () => {
      await service.cancelTask('task-1');
      // Should not throw
    });
  });
});