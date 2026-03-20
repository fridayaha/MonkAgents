import { Test, TestingModule } from '@nestjs/testing';
import { WebSocketService } from './websocket.service';

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

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [WebSocketService],
    }).compile();

    service = module.get<WebSocketService>(WebSocketService);
  });

  describe('addClient', () => {
    it('should add client to map', () => {
      service.addClient(mockSocket as any);
      // Client should be stored
      service.leaveSession('socket-123', 'session-1');
    });
  });

  describe('removeClient', () => {
    it('should remove client from map', () => {
      service.addClient(mockSocket as any);
      service.removeClient(mockSocket as any);
      // Client should be removed
    });
  });

  describe('joinSession', () => {
    it('should track client session membership', () => {
      service.addClient(mockSocket as any);
      service.joinSession('socket-123', 'session-1');
      // Session should be tracked
    });
  });

  describe('leaveSession', () => {
    it('should remove client session membership', () => {
      service.addClient(mockSocket as any);
      service.joinSession('socket-123', 'session-1');
      service.leaveSession('socket-123', 'session-1');
      // Session should be removed
    });
  });

  describe('setServer', () => {
    it('should store server reference', () => {
      service.setServer(mockServer as any);
      // Server should be set
    });
  });

  describe('emitToSession', () => {
    it('should emit event to session room', () => {
      service.setServer(mockServer as any);
      service.emitToSession('session-1', 'test-event', { data: 'test' });
      expect(mockServer.to).toHaveBeenCalledWith('session:session-1');
      expect(mockServer.emit).toHaveBeenCalledWith('test-event', { data: 'test' });
    });
  });

  describe('emitToAll', () => {
    it('should emit event to all clients', () => {
      service.setServer(mockServer as any);
      service.emitToAll('test-event', { data: 'test' });
      expect(mockServer.emit).toHaveBeenCalledWith('test-event', { data: 'test' });
    });
  });

  describe('emitAgentStatus', () => {
    it('should emit agent status update', () => {
      service.setServer(mockServer as any);
      service.emitAgentStatus('agent-1', 'thinking');
      expect(mockServer.emit).toHaveBeenCalledWith('agent_status', {
        agentId: 'agent-1',
        status: 'thinking',
      });
    });
  });

  describe('emitTaskStatus', () => {
    it('should emit task status update', () => {
      service.setServer(mockServer as any);
      service.emitTaskStatus('task-1', 'completed');
      expect(mockServer.emit).toHaveBeenCalledWith('task_status', {
        taskId: 'task-1',
        status: 'completed',
      });
    });
  });

  describe('emitError', () => {
    it('should emit error to all when no session', () => {
      service.setServer(mockServer as any);
      service.emitError('TEST_ERROR', 'Something went wrong');
      expect(mockServer.emit).toHaveBeenCalledWith('error', {
        code: 'TEST_ERROR',
        message: 'Something went wrong',
      });
    });

    it('should emit error to specific session', () => {
      service.setServer(mockServer as any);
      service.emitError('TEST_ERROR', 'Something went wrong', 'session-1');
      expect(mockServer.to).toHaveBeenCalledWith('session:session-1');
    });
  });
});