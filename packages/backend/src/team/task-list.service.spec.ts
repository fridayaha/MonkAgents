import { Test, TestingModule } from '@nestjs/testing';
import { TaskListService } from './task-list.service';
import { RedisService } from '../redis/redis.service';

describe('TaskListService', () => {
  let service: TaskListService;
  let redisService: RedisService;

  const mockRedisService = {
    isAvailable: jest.fn().mockReturnValue(true),
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(undefined),
    client: {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskListService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<TaskListService>(TaskListService);
    redisService = module.get<RedisService>(RedisService);
    service.setRedisService(redisService);
  });

  describe('createTask', () => {
    it('should create a task with default values', async () => {
      const task = await service.createTask({
        teamId: 'team-1',
        subject: 'Test Task',
        description: 'Test Description',
      });

      expect(task).toBeDefined();
      expect(task.teamId).toBe('team-1');
      expect(task.subject).toBe('Test Task');
      expect(task.status).toBe('pending');
      expect(task.priority).toBe('medium');
      expect(task.blockedBy).toEqual([]);
      expect(task.blocks).toEqual([]);
    });

    it('should create a task with specified priority', async () => {
      const task = await service.createTask({
        teamId: 'team-1',
        subject: 'High Priority Task',
        description: 'Test Description',
        priority: 'high',
      });

      expect(task.priority).toBe('high');
    });

    it('should create a task with dependencies', async () => {
      // Create first task
      const task1 = await service.createTask({
        teamId: 'team-1',
        subject: 'Task 1',
        description: 'First task',
      });

      // Create second task that depends on first
      const task2 = await service.createTask({
        teamId: 'team-1',
        subject: 'Task 2',
        description: 'Second task',
        blockedBy: [task1.id],
      });

      expect(task2.blockedBy).toContain(task1.id);

      // Check that first task has second task in blocks
      const task1Updated = service.getTask(task1.id);
      expect(task1Updated?.blocks).toContain(task2.id);
    });
  });

  describe('getTask', () => {
    it('should return task by id', async () => {
      const created = await service.createTask({
        teamId: 'team-1',
        subject: 'Test Task',
        description: 'Test Description',
      });

      const task = service.getTask(created.id);
      expect(task).toBeDefined();
      expect(task?.id).toBe(created.id);
    });

    it('should return undefined for non-existent task', () => {
      const task = service.getTask('non-existent');
      expect(task).toBeUndefined();
    });
  });

  describe('getTeamTasks', () => {
    it('should return all tasks for a team', async () => {
      await service.createTask({
        teamId: 'team-1',
        subject: 'Task 1',
        description: 'Task 1',
      });
      await service.createTask({
        teamId: 'team-1',
        subject: 'Task 2',
        description: 'Task 2',
      });
      await service.createTask({
        teamId: 'team-2',
        subject: 'Task 3',
        description: 'Task 3',
      });

      const tasks = service.getTeamTasks('team-1');
      expect(tasks).toHaveLength(2);
    });
  });

  describe('claimTask', () => {
    it('should claim an available task', async () => {
      const task = await service.createTask({
        teamId: 'team-1',
        subject: 'Test Task',
        description: 'Test Description',
      });

      const result = await service.claimTask('team-1', 'wukong');

      expect(result.success).toBe(true);
      expect(result.task?.id).toBe(task.id);
      expect(result.task?.status).toBe('in_progress');
      expect(result.task?.owner).toBe('wukong');
    });

    it('should not claim a blocked task', async () => {
      const task1 = await service.createTask({
        teamId: 'team-1',
        subject: 'Task 1',
        description: 'First task',
      });

      await service.createTask({
        teamId: 'team-1',
        subject: 'Task 2',
        description: 'Blocked task',
        blockedBy: [task1.id],
      });

      // First claim should get task 1
      const result1 = await service.claimTask('team-1', 'wukong');
      expect(result1.success).toBe(true);
      expect(result1.task?.subject).toBe('Task 1');

      // Second claim should fail (task 2 is blocked)
      const result2 = await service.claimTask('team-1', 'bajie');
      expect(result2.success).toBe(false);
    });

    it('should claim previously blocked task after dependency completes', async () => {
      const task1 = await service.createTask({
        teamId: 'team-1',
        subject: 'Task 1',
        description: 'First task',
      });

      const task2 = await service.createTask({
        teamId: 'team-1',
        subject: 'Task 2',
        description: 'Blocked task',
        blockedBy: [task1.id],
      });

      // Complete task 1
      await service.claimTask('team-1', 'wukong');
      await service.completeTask(task1.id);

      // Now task 2 should be available
      const result = await service.claimTask('team-1', 'bajie');
      expect(result.success).toBe(true);
      expect(result.task?.id).toBe(task2.id);
    });

    it('should claim highest priority task first', async () => {
      await service.createTask({
        teamId: 'team-1',
        subject: 'Low Priority',
        description: 'Low',
        priority: 'low',
      });
      await service.createTask({
        teamId: 'team-1',
        subject: 'High Priority',
        description: 'High',
        priority: 'high',
      });
      await service.createTask({
        teamId: 'team-1',
        subject: 'Medium Priority',
        description: 'Medium',
        priority: 'medium',
      });

      const result = await service.claimTask('team-1', 'wukong');
      expect(result.success).toBe(true);
      expect(result.task?.priority).toBe('high');
    });

    it('should only claim task assigned to specific agent', async () => {
      await service.createTask({
        teamId: 'team-1',
        subject: 'Task for Wukong',
        description: 'Assigned task',
        assignedTo: 'wukong',
      });
      await service.createTask({
        teamId: 'team-1',
        subject: 'Task for Bajie',
        description: 'Assigned task',
        assignedTo: 'bajie',
      });

      const result = await service.claimTask('team-1', 'wukong');
      expect(result.success).toBe(true);
      expect(result.task?.subject).toBe('Task for Wukong');
    });
  });

  describe('completeTask', () => {
    it('should complete a claimed task', async () => {
      const task = await service.createTask({
        teamId: 'team-1',
        subject: 'Test Task',
        description: 'Test Description',
      });

      await service.claimTask('team-1', 'wukong');
      await service.completeTask(task.id, { status: 'completed' });

      const completedTask = service.getTask(task.id);
      expect(completedTask?.status).toBe('completed');
      expect(completedTask?.completedAt).toBeDefined();
    });
  });

  describe('failTask', () => {
    it('should mark task as failed', async () => {
      const task = await service.createTask({
        teamId: 'team-1',
        subject: 'Test Task',
        description: 'Test Description',
      });

      await service.claimTask('team-1', 'wukong');
      await service.failTask(task.id, 'Something went wrong');

      const failedTask = service.getTask(task.id);
      expect(failedTask?.status).toBe('failed');
    });
  });

  describe('getTaskCounts', () => {
    it('should return counts by status', async () => {
      const task1 = await service.createTask({
        teamId: 'team-1',
        subject: 'Task 1',
        description: 'Task 1',
      });
      await service.createTask({
        teamId: 'team-1',
        subject: 'Task 2',
        description: 'Task 2',
      });

      await service.claimTask('team-1', 'wukong');
      await service.completeTask(task1.id);

      const counts = service.getTaskCounts('team-1');
      expect(counts.pending).toBe(1);
      expect(counts.completed).toBe(1);
    });
  });

  describe('isTeamComplete', () => {
    it('should return false when tasks are pending', async () => {
      await service.createTask({
        teamId: 'team-1',
        subject: 'Task 1',
        description: 'Task 1',
      });

      expect(service.isTeamComplete('team-1')).toBe(false);
    });

    it('should return true when all tasks are completed', async () => {
      const task = await service.createTask({
        teamId: 'team-1',
        subject: 'Task 1',
        description: 'Task 1',
      });

      await service.claimTask('team-1', 'wukong');
      await service.completeTask(task.id);

      expect(service.isTeamComplete('team-1')).toBe(true);
    });
  });

  describe('clearTeamTasks', () => {
    it('should clear all tasks for a team', async () => {
      await service.createTask({
        teamId: 'team-1',
        subject: 'Task 1',
        description: 'Task 1',
      });
      await service.createTask({
        teamId: 'team-1',
        subject: 'Task 2',
        description: 'Task 2',
      });

      await service.clearTeamTasks('team-1');

      const tasks = service.getTeamTasks('team-1');
      expect(tasks).toHaveLength(0);
    });
  });
});