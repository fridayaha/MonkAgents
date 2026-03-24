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

  const mockSessionService = {
    addMessage: jest.fn().mockResolvedValue({ id: 'msg-id' }),
    getSessionMessages: jest.fn().mockResolvedValue([]),
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
    // Set dependencies including sessionService
    service.setDependencies({} as any, {} as any, mockSessionService as any);
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

  // ==================== Message Persistence Tests ====================

  describe('broadcastMessage', () => {
    beforeEach(() => {
      service.setServer(mockServer as unknown as Server);
    });

    it('should emit message to WebSocket clients', () => {
      const message = {
        id: 'msg-1',
        sessionId: 'session-1',
        sender: 'user' as const,
        senderId: 'user-1',
        senderName: 'User',
        type: 'text' as const,
        content: 'Hello',
        createdAt: new Date(),
      };

      service.broadcastMessage('session-1', message);

      expect(mockServer.to).toHaveBeenCalledWith('session:session-1');
      expect(mockServer.emit).toHaveBeenCalledWith('message', message);
    });

    it('should persist text message to database and Redis', async () => {
      const message = {
        id: 'msg-1',
        sessionId: 'session-1',
        sender: 'agent' as const,
        senderId: 'wukong',
        senderName: '孙悟空',
        type: 'text' as const,
        content: '任务完成',
        createdAt: new Date(),
      };

      service.broadcastMessage('session-1', message);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockSessionService.addMessage).toHaveBeenCalledWith('session-1', expect.objectContaining({
        id: 'msg-1',
        type: 'text',
        content: '任务完成',
      }));
      expect(mockRedisService.addMessageToHistory).toHaveBeenCalledWith('session-1', message);
    });

    it('should persist tool_use message to database', async () => {
      const message = {
        id: 'tool-1',
        sessionId: 'session-1',
        sender: 'agent' as const,
        senderId: 'wukong',
        senderName: '孙悟空',
        type: 'tool_use' as const,
        content: '使用工具: Read',
        metadata: { toolName: 'Read', isComplete: true },
        createdAt: new Date(),
      };

      service.broadcastMessage('session-1', message);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockSessionService.addMessage).toHaveBeenCalled();
    });

    it('should persist error message to database', async () => {
      const message = {
        id: 'error-1',
        sessionId: 'session-1',
        sender: 'system' as const,
        senderId: 'system',
        senderName: '系统',
        type: 'error' as const,
        content: '执行出错',
        createdAt: new Date(),
      };

      service.broadcastMessage('session-1', message);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockSessionService.addMessage).toHaveBeenCalled();
    });

    it('should NOT persist streaming messages (isStreaming=true)', async () => {
      const message = {
        id: 'stream-msg-1',
        sessionId: 'session-1',
        sender: 'agent' as const,
        senderId: 'wukong',
        senderName: '孙悟空',
        type: 'thinking' as const,
        content: 'Partial content',
        metadata: { isStreaming: true },
        createdAt: new Date(),
      };

      service.broadcastMessage('session-1', message);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockSessionService.addMessage).not.toHaveBeenCalled();
      expect(mockRedisService.addMessageToHistory).not.toHaveBeenCalled();
    });

    it('should NOT persist status messages', async () => {
      const message = {
        id: 'status-1',
        sessionId: 'session-1',
        sender: 'agent' as const,
        senderId: 'wukong',
        senderName: '孙悟空',
        type: 'status' as const,
        content: '正在思考...',
        createdAt: new Date(),
      };

      service.broadcastMessage('session-1', message);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockSessionService.addMessage).not.toHaveBeenCalled();
    });

    it('should NOT persist thinking messages', async () => {
      const message = {
        id: 'thinking-1',
        sessionId: 'session-1',
        sender: 'agent' as const,
        senderId: 'wukong',
        senderName: '孙悟空',
        type: 'thinking' as const,
        content: '思考中...',
        createdAt: new Date(),
      };

      service.broadcastMessage('session-1', message);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockSessionService.addMessage).not.toHaveBeenCalled();
    });

    it('should NOT persist chat_complete messages', async () => {
      const message = {
        id: 'chat-complete-1',
        sessionId: 'session-1',
        sender: 'system' as const,
        senderId: 'system',
        senderName: '系统',
        type: 'chat_complete' as const,
        content: '',
        createdAt: new Date(),
      };

      service.broadcastMessage('session-1', message);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockSessionService.addMessage).not.toHaveBeenCalled();
    });
  });

  describe('loadAndSendSessionHistory', () => {
    it('should load history from database first', async () => {
      const mockMessages = [
        { id: 'msg-1', content: 'Message 1', createdAt: new Date() },
        { id: 'msg-2', content: 'Message 2', createdAt: new Date() },
      ];

      mockSessionService.getSessionMessages.mockResolvedValue(mockMessages);

      service.addClient(mockSocket as unknown as Socket);
      service.setServer(mockServer as unknown as Server);
      service.joinSession('socket-123', 'session-1');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockSessionService.getSessionMessages).toHaveBeenCalledWith('session-1');
      expect(mockSocket.emit).toHaveBeenCalledWith('session_history', expect.objectContaining({
        sessionId: 'session-1',
        count: 2,
      }));
    });

    it('should fallback to Redis if database is empty', async () => {
      mockSessionService.getSessionMessages.mockResolvedValue([]);
      mockRedisService.getSessionHistory.mockResolvedValue([
        { id: 'redis-msg-1', content: 'Redis Message' },
      ]);

      service.addClient(mockSocket as unknown as Socket);
      service.setServer(mockServer as unknown as Server);
      service.joinSession('socket-123', 'session-1');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockRedisService.getSessionHistory).toHaveBeenCalled();
    });
  });
});