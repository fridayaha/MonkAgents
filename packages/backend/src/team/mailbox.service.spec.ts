import { Test, TestingModule } from '@nestjs/testing';
import { MailboxService } from './mailbox.service';
import { RedisService } from '../redis/redis.service';

describe('MailboxService', () => {
  let service: MailboxService;

  const mockRedisService = {
    isAvailable: jest.fn().mockReturnValue(true),
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailboxService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<MailboxService>(MailboxService);
  });

  describe('registerHandler', () => {
    it('should register a handler for an agent', () => {
      const handler = jest.fn();
      service.registerHandler('wukong', handler);

      // Handler should be stored (no direct access, but we can test via getPendingMessages)
      expect(service.hasPendingMessages('wukong')).toBe(false);
    });
  });

  describe('unregisterHandler', () => {
    it('should unregister a handler', () => {
      const handler = jest.fn();
      service.registerHandler('wukong', handler);
      service.unregisterHandler('wukong');

      // No error should be thrown
      expect(true).toBe(true);
    });
  });

  describe('sendMessage', () => {
    it('should create a message with correct properties', async () => {
      const message = await service.sendMessage(
        'team-1',
        'wukong',
        'shaseng',
        'handoff',
        {
          taskId: 'task-1',
          targetAgent: 'shaseng',
          task: 'Review code',
          reason: 'Code needs review',
        },
      );

      expect(message).toBeDefined();
      expect(message.teamId).toBe('team-1');
      expect(message.from).toBe('wukong');
      expect(message.to).toBe('shaseng');
      expect(message.type).toBe('handoff');
      expect(message.id).toBeDefined();
      expect(message.timestamp).toBeDefined();
    });
  });

  describe('broadcastMessage', () => {
    it('should create a broadcast message', async () => {
      // Register handlers for multiple agents
      service.registerHandler('wukong', jest.fn());
      service.registerHandler('shaseng', jest.fn());
      service.registerHandler('bajie', jest.fn());

      const message = await service.broadcastMessage(
        'team-1',
        'tangseng',
        'notification',
        {
          title: 'Team Update',
          message: 'All tasks completed',
          level: 'info',
        },
      );

      expect(message).toBeDefined();
      expect(message.to).toBe('broadcast');
      expect(message.from).toBe('tangseng');
    });
  });

  describe('getPendingMessages', () => {
    it('should return empty array when no messages', () => {
      const messages = service.getPendingMessages('wukong');
      expect(messages).toEqual([]);
    });

    it('should return queued messages', async () => {
      // Register a handler (so messages get queued)
      service.registerHandler('shaseng', jest.fn());

      // Send a message
      await service.sendMessage(
        'team-1',
        'wukong',
        'shaseng',
        'task_update',
        { taskId: 'task-1', status: 'completed' },
      );

      // Get pending messages
      const messages = service.getPendingMessages('shaseng');
      expect(messages.length).toBeGreaterThan(0);
    });

    it('should clear queue after retrieval', async () => {
      service.registerHandler('shaseng', jest.fn());
      await service.sendMessage(
        'team-1',
        'wukong',
        'shaseng',
        'task_update',
        { taskId: 'task-1', status: 'completed' },
      );

      service.getPendingMessages('shaseng');
      const messages = service.getPendingMessages('shaseng');
      expect(messages).toEqual([]);
    });
  });

  describe('hasPendingMessages', () => {
    it('should return false when no messages', () => {
      expect(service.hasPendingMessages('wukong')).toBe(false);
    });

    it('should return true when messages exist', async () => {
      service.registerHandler('wukong', jest.fn());
      await service.sendMessage(
        'team-1',
        'shaseng',
        'wukong',
        'notification',
        { title: 'Test', message: 'Test message', level: 'info' },
      );

      expect(service.hasPendingMessages('wukong')).toBe(true);
    });
  });

  describe('clearTeamMessages', () => {
    it('should clear all messages for a team', async () => {
      service.registerHandler('wukong', jest.fn());
      service.registerHandler('shaseng', jest.fn());

      await service.sendMessage(
        'team-1',
        'tangseng',
        'wukong',
        'notification',
        { title: 'Test', message: 'Test', level: 'info' },
      );
      await service.sendMessage(
        'team-1',
        'tangseng',
        'shaseng',
        'notification',
        { title: 'Test', message: 'Test', level: 'info' },
      );

      await service.clearTeamMessages('team-1');

      expect(service.hasPendingMessages('wukong')).toBe(false);
      expect(service.hasPendingMessages('shaseng')).toBe(false);
    });
  });
});