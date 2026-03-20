import { Test, TestingModule } from '@nestjs/testing';
import { WebSocketGateway } from './websocket.gateway';
import { WebSocketService } from './websocket.service';
import { Socket } from 'socket.io';

describe('WebSocketGateway', () => {
  let gateway: WebSocketGateway;

  const mockSocket = {
    id: 'socket-123',
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
  } as unknown as Socket;

  const mockWebSocketService = {
    addClient: jest.fn(),
    removeClient: jest.fn(),
    joinSession: jest.fn(),
    leaveSession: jest.fn(),
    handleUserMessage: jest.fn(),
    cancelTask: jest.fn(),
    setServer: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebSocketGateway,
        {
          provide: WebSocketService,
          useValue: mockWebSocketService,
        },
      ],
    }).compile();

    gateway = module.get<WebSocketGateway>(WebSocketGateway);
  });

  describe('handleConnection', () => {
    it('should add client on connection', () => {
      gateway.handleConnection(mockSocket);
      expect(mockWebSocketService.addClient).toHaveBeenCalledWith(mockSocket);
    });
  });

  describe('handleDisconnect', () => {
    it('should remove client on disconnect', () => {
      gateway.handleDisconnect(mockSocket);
      expect(mockWebSocketService.removeClient).toHaveBeenCalledWith(mockSocket);
    });
  });

  describe('handleJoin', () => {
    it('should join session room', () => {
      gateway.handleJoin(mockSocket, 'session-123');
      expect(mockSocket.join).toHaveBeenCalledWith('session:session-123');
      expect(mockWebSocketService.joinSession).toHaveBeenCalledWith('socket-123', 'session-123');
    });
  });

  describe('handleLeave', () => {
    it('should leave session room', () => {
      gateway.handleLeave(mockSocket, 'session-123');
      expect(mockSocket.leave).toHaveBeenCalledWith('session:session-123');
      expect(mockWebSocketService.leaveSession).toHaveBeenCalledWith('socket-123', 'session-123');
    });
  });

  describe('handleMessage', () => {
    it('should handle user message', () => {
      const data = { sessionId: 'session-123', content: 'Hello' };
      gateway.handleMessage(mockSocket, data);
      expect(mockWebSocketService.handleUserMessage).toHaveBeenCalledWith(
        'session-123',
        'session-123',
        'Hello'
      );
    });
  });

  describe('handleCancel', () => {
    it('should cancel task', () => {
      gateway.handleCancel(mockSocket, 'task-123');
      expect(mockWebSocketService.cancelTask).toHaveBeenCalledWith('task-123');
    });
  });
});