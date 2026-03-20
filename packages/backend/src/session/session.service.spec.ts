import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SessionService } from './session.service';
import { Conversation } from '../database/entities/conversation.entity';
import { Task } from '../database/entities/task.entity';
import { NotFoundException } from '@nestjs/common';

describe('SessionService', () => {
  let service: SessionService;

  const mockConversationRepo = {
    find: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  };

  const mockTaskRepo = {
    find: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        {
          provide: getRepositoryToken(Conversation),
          useValue: mockConversationRepo,
        },
        {
          provide: getRepositoryToken(Task),
          useValue: mockTaskRepo,
        },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
  });

  describe('create', () => {
    it('should create a new session', async () => {
      const input = {
        workingDirectory: '/test/path',
        title: 'Test Session',
      };

      const session = await service.create(input);

      expect(session.id).toBeDefined();
      expect(session.workingDirectory).toBe('/test/path');
      expect(session.title).toBe('Test Session');
      expect(session.status).toBe('active');
      expect(session.messageCount).toBe(0);
      expect(session.taskCount).toBe(0);
    });

    it('should create session without title', async () => {
      const input = {
        workingDirectory: '/test/path',
      };

      const session = await service.create(input);

      expect(session.id).toBeDefined();
      expect(session.title).toBeUndefined();
    });

    it('should generate unique session IDs', async () => {
      const session1 = await service.create({ workingDirectory: '/path1' });
      const session2 = await service.create({ workingDirectory: '/path2' });

      expect(session1.id).not.toBe(session2.id);
    });
  });

  describe('findAll', () => {
    it('should return empty array when no sessions', async () => {
      const sessions = await service.findAll();
      expect(sessions).toEqual([]);
    });

    it('should return all sessions sorted by updatedAt', async () => {
      await service.create({ workingDirectory: '/path1', title: 'First' });
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      await service.create({ workingDirectory: '/path2', title: 'Second' });

      const sessions = await service.findAll();
      expect(sessions).toHaveLength(2);
      expect(sessions[0].title).toBe('Second'); // Most recent first
    });
  });

  describe('findOne', () => {
    it('should return session with messages and tasks', async () => {
      mockConversationRepo.find.mockResolvedValue([]);
      mockTaskRepo.find.mockResolvedValue([]);

      const created = await service.create({
        workingDirectory: '/test',
        title: 'Test',
      });

      const session = await service.findOne(created.id);

      expect(session.id).toBe(created.id);
      expect(session.messages).toEqual([]);
      expect(session.tasks).toEqual([]);
    });

    it('should throw NotFoundException for non-existent session', async () => {
      await expect(service.findOne('non-existent-id')).rejects.toThrow(NotFoundException);
    });

    it('should return messages from database', async () => {
      const mockMessages = [
        { id: 'msg-1', sessionId: 'session-1', content: 'Hello' },
      ];
      mockConversationRepo.find.mockResolvedValue(mockMessages);
      mockTaskRepo.find.mockResolvedValue([]);

      const created = await service.create({ workingDirectory: '/test' });
      await service.findOne(created.id);

      expect(mockConversationRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId: created.id },
        })
      );
    });
  });

  describe('update', () => {
    it('should update session title', async () => {
      const created = await service.create({ workingDirectory: '/test' });
      const updated = await service.update(created.id, { title: 'New Title' });

      expect(updated.title).toBe('New Title');
    });

    it('should update session status', async () => {
      const created = await service.create({ workingDirectory: '/test' });
      const updated = await service.update(created.id, { status: 'paused' });

      expect(updated.status).toBe('paused');
    });

    it('should throw NotFoundException for non-existent session', async () => {
      await expect(
        service.update('non-existent', { title: 'Test' })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete session and related data', async () => {
      mockConversationRepo.delete.mockResolvedValue(undefined);
      mockTaskRepo.delete.mockResolvedValue(undefined);

      const created = await service.create({ workingDirectory: '/test' });
      await service.remove(created.id);

      expect(mockConversationRepo.delete).toHaveBeenCalledWith({ sessionId: created.id });
      expect(mockTaskRepo.delete).toHaveBeenCalledWith({ sessionId: created.id });

      await expect(service.findOne(created.id)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for non-existent session', async () => {
      await expect(service.remove('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateMessageCount', () => {
    it('should update message count from database', async () => {
      mockConversationRepo.count.mockResolvedValue(5);

      const created = await service.create({ workingDirectory: '/test' });
      await service.updateMessageCount(created.id);

      expect(mockConversationRepo.count).toHaveBeenCalled();
    });
  });

  describe('updateTaskCount', () => {
    it('should update task count from database', async () => {
      mockTaskRepo.count.mockResolvedValue(3);

      const created = await service.create({ workingDirectory: '/test' });
      await service.updateTaskCount(created.id);

      expect(mockTaskRepo.count).toHaveBeenCalled();
    });
  });
});