import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { Task } from '../database/entities/task.entity';
import { Subtask } from '../database/entities/subtask.entity';
import { NotFoundException } from '@nestjs/common';

describe('TasksService', () => {
  let service: TasksService;

  const mockTaskRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockSubtaskRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        {
          provide: getRepositoryToken(Task),
          useValue: mockTaskRepository,
        },
        {
          provide: getRepositoryToken(Subtask),
          useValue: mockSubtaskRepository,
        },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new task', async () => {
      const dto = {
        sessionId: 'session-1',
        userPrompt: 'Write a function',
      };

      const mockTask = {
        id: 'task-1',
        ...dto,
        status: 'pending',
        priority: 'normal',
        assignedAgents: [],
        subtasks: [],
      };

      mockTaskRepository.create.mockReturnValue(mockTask);
      mockTaskRepository.save.mockResolvedValue(mockTask);

      const result = await service.create(dto);

      expect(mockTaskRepository.create).toHaveBeenCalled();
      expect(mockTaskRepository.save).toHaveBeenCalledWith(mockTask);
      expect(result).toEqual(mockTask);
    });

    it('should create task with custom priority', async () => {
      const dto = {
        sessionId: 'session-1',
        userPrompt: 'Urgent task',
        priority: 'urgent' as const,
      };

      const mockTask = {
        id: 'task-1',
        ...dto,
        status: 'pending',
        assignedAgents: [],
        subtasks: [],
      };

      mockTaskRepository.create.mockReturnValue(mockTask);
      mockTaskRepository.save.mockResolvedValue(mockTask);

      const result = await service.create(dto);

      expect(result.priority).toBe('urgent');
    });
  });

  describe('findOne', () => {
    it('should return a task by id', async () => {
      const mockTask = {
        id: 'task-1',
        sessionId: 'session-1',
        userPrompt: 'Test task',
        status: 'pending',
        subtasks: [],
      };

      mockTaskRepository.findOne.mockResolvedValue(mockTask);

      const result = await service.findOne('task-1');

      expect(result).toEqual(mockTask);
    });

    it('should throw NotFoundException if task not found', async () => {
      mockTaskRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update task status', async () => {
      const mockTask = {
        id: 'task-1',
        status: 'pending',
        startedAt: null,
      };

      mockTaskRepository.findOne.mockResolvedValue(mockTask);
      mockTaskRepository.save.mockResolvedValue({ ...mockTask, status: 'executing', startedAt: expect.any(Date) });

      const result = await service.update('task-1', { status: 'executing' });

      expect(result.status).toBe('executing');
    });

    it('should set completedAt when task completes', async () => {
      const mockTask = {
        id: 'task-1',
        status: 'executing',
      };

      mockTaskRepository.findOne.mockResolvedValue(mockTask);
      mockTaskRepository.save.mockResolvedValue({ ...mockTask, status: 'completed', completedAt: expect.any(Date) });

      const result = await service.update('task-1', { status: 'completed' });

      expect(result.status).toBe('completed');
    });
  });

  describe('retry', () => {
    it('should retry a failed task', async () => {
      const mockTask = {
        id: 'task-1',
        status: 'failed',
        error: 'Some error',
      };

      mockTaskRepository.findOne.mockResolvedValue(mockTask);
      mockTaskRepository.save.mockResolvedValue({ ...mockTask, status: 'pending', error: null });

      const result = await service.retry('task-1');

      expect(result.status).toBe('pending');
    });

    it('should throw error if task is not failed', async () => {
      const mockTask = {
        id: 'task-1',
        status: 'completed',
      };

      mockTaskRepository.findOne.mockResolvedValue(mockTask);

      await expect(service.retry('task-1')).rejects.toThrow('Only failed tasks can be retried');
    });
  });

  describe('cancel', () => {
    it('should cancel a pending task', async () => {
      const mockTask = {
        id: 'task-1',
        status: 'pending',
      };

      mockTaskRepository.findOne.mockResolvedValue(mockTask);
      mockTaskRepository.save.mockResolvedValue({
        ...mockTask,
        status: 'failed',
        error: 'Cancelled by user',
        completedAt: expect.any(Date),
      });

      const result = await service.cancel('task-1');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Cancelled by user');
    });

    it('should throw error if task cannot be cancelled', async () => {
      const mockTask = {
        id: 'task-1',
        status: 'completed',
      };

      mockTaskRepository.findOne.mockResolvedValue(mockTask);

      await expect(service.cancel('task-1')).rejects.toThrow('Cannot cancel task');
    });
  });

  describe('createSubtask', () => {
    it('should create a subtask', async () => {
      const mockTask = {
        id: 'task-1',
        assignedAgents: [],
      };

      const dto = {
        taskId: 'task-1',
        agentId: 'wukong',
        agentRole: 'executor',
        description: 'Write code',
      };

      mockTaskRepository.findOne.mockResolvedValue(mockTask);
      mockSubtaskRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ max: null }),
      });
      mockSubtaskRepository.create.mockReturnValue({ id: 'subtask-1', ...dto, order: 0, status: 'pending' });
      mockSubtaskRepository.save.mockResolvedValue({ id: 'subtask-1', ...dto, order: 0, status: 'pending' });
      mockTaskRepository.save.mockResolvedValue({ ...mockTask, assignedAgents: ['wukong'] });

      const result = await service.createSubtask(dto);

      expect(result).toBeDefined();
    });
  });
});