import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SessionService } from './session.service';
import { Session } from '../database/entities/session.entity';
import { Conversation } from '../database/entities/conversation.entity';
import { Task } from '../database/entities/task.entity';
import { NotFoundException } from '@nestjs/common';

describe('SessionService', () => {
  let service: SessionService;

  const mockSessionRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

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
          provide: getRepositoryToken(Session),
          useValue: mockSessionRepo,
        },
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

      const mockSession = {
        id: 'test-uuid',
        workingDirectory: '/test/path',
        title: 'Test Session',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSessionRepo.create.mockReturnValue(mockSession);
      mockSessionRepo.save.mockResolvedValue(mockSession);

      const session = await service.create(input);

      expect(session.id).toBeDefined();
      expect(session.workingDirectory).toBe('/test/path');
      expect(session.title).toBe('Test Session');
      expect(session.status).toBe('active');
    });

    it('should create session without title', async () => {
      const input = {
        workingDirectory: '/test/path',
      };

      const mockSession = {
        id: 'test-uuid',
        workingDirectory: '/test/path',
        title: null,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSessionRepo.create.mockReturnValue(mockSession);
      mockSessionRepo.save.mockResolvedValue(mockSession);

      const session = await service.create(input);

      expect(session.id).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('should return empty array when no sessions', async () => {
      mockSessionRepo.find.mockResolvedValue([]);
      mockConversationRepo.count.mockResolvedValue(0);
      mockTaskRepo.count.mockResolvedValue(0);

      const sessions = await service.findAll();
      expect(sessions).toEqual([]);
    });

    it('should return all sessions sorted by updatedAt', async () => {
      const mockSessions = [
        { id: '1', title: 'Second', updatedAt: new Date('2024-01-02') },
        { id: '2', title: 'First', updatedAt: new Date('2024-01-01') },
      ];

      mockSessionRepo.find.mockResolvedValue(mockSessions);
      mockConversationRepo.count.mockResolvedValue(0);
      mockTaskRepo.count.mockResolvedValue(0);

      const sessions = await service.findAll();
      expect(sessions).toHaveLength(2);
    });
  });

  describe('findOne', () => {
    it('should return session with messages and tasks', async () => {
      const mockSession = {
        id: 'test-id',
        title: 'Test',
        status: 'active',
        workingDirectory: '/test',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSessionRepo.findOne.mockResolvedValue(mockSession);
      mockConversationRepo.find.mockResolvedValue([]);
      mockTaskRepo.find.mockResolvedValue([]);

      const session = await service.findOne('test-id');

      expect(session.id).toBe('test-id');
      expect(session.messages).toEqual([]);
      expect(session.tasks).toEqual([]);
    });

    it('should throw NotFoundException for non-existent session', async () => {
      mockSessionRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update session title', async () => {
      const mockSession = {
        id: 'test-id',
        title: 'Old Title',
        status: 'active',
        workingDirectory: '/test',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedSession = {
        ...mockSession,
        title: 'New Title',
      };

      mockSessionRepo.findOne.mockResolvedValue(mockSession);
      mockSessionRepo.save.mockResolvedValue(updatedSession);

      const updated = await service.update('test-id', { title: 'New Title' });

      expect(updated.title).toBe('New Title');
    });

    it('should throw NotFoundException for non-existent session', async () => {
      mockSessionRepo.findOne.mockResolvedValue(null);
      await expect(
        service.update('non-existent', { title: 'Test' })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete session and related data', async () => {
      const mockSession = {
        id: 'test-id',
        title: 'Test',
      };

      mockSessionRepo.findOne.mockResolvedValue(mockSession);
      mockConversationRepo.delete.mockResolvedValue(undefined);
      mockTaskRepo.delete.mockResolvedValue(undefined);
      mockSessionRepo.remove.mockResolvedValue(undefined);

      await service.remove('test-id');

      expect(mockConversationRepo.delete).toHaveBeenCalledWith({ sessionId: 'test-id' });
      expect(mockTaskRepo.delete).toHaveBeenCalledWith({ sessionId: 'test-id' });
      expect(mockSessionRepo.remove).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent session', async () => {
      mockSessionRepo.findOne.mockResolvedValue(null);
      await expect(service.remove('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateMessageCount', () => {
    it('should update session updatedAt', async () => {
      mockSessionRepo.update.mockResolvedValue(undefined);

      await service.updateMessageCount('test-id');

      expect(mockSessionRepo.update).toHaveBeenCalled();
    });
  });

  describe('updateTaskCount', () => {
    it('should update session updatedAt', async () => {
      mockSessionRepo.update.mockResolvedValue(undefined);

      await service.updateTaskCount('test-id');

      expect(mockSessionRepo.update).toHaveBeenCalled();
    });
  });
});