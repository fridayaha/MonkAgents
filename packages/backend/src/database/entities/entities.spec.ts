import { Task } from './task.entity';
import { Subtask } from './subtask.entity';
import { Agent } from './agent.entity';
import { Conversation } from './conversation.entity';
import { Checkpoint } from './checkpoint.entity';
import { ScheduledTask } from './scheduled-task.entity';
import { ExecutionLog } from './execution-log.entity';

describe('Database Entities', () => {
  describe('Task Entity', () => {
    it('should create a task with default values', () => {
      const task = new Task();
      task.sessionId = 'session-1';
      task.userPrompt = 'Test prompt';
      task.status = 'pending';
      task.priority = 'normal';

      expect(task.sessionId).toBe('session-1');
      expect(task.status).toBe('pending');
      expect(task.priority).toBe('normal');
      expect(task.assignedAgents).toBeUndefined();
      expect(task.subtasks).toBeUndefined();
    });

    it('should have correct column types', () => {
      const task = new Task();
      task.id = 'uuid-123';
      task.userPrompt = 'Long prompt text';
      task.result = 'Result text';
      task.error = 'Error message';

      expect(task.id).toBe('uuid-123');
      expect(typeof task.userPrompt).toBe('string');
    });
  });

  describe('Subtask Entity', () => {
    it('should create a subtask with default values', () => {
      const subtask = new Subtask();
      subtask.taskId = 'task-1';
      subtask.agentId = 'agent-1';
      subtask.agentRole = 'executor';
      subtask.description = 'Test subtask';
      subtask.status = 'pending';
      subtask.order = 1;

      expect(subtask.taskId).toBe('task-1');
      expect(subtask.agentRole).toBe('executor');
      expect(subtask.order).toBe(1);
    });
  });

  describe('Agent Entity', () => {
    it('should create an agent with config values', () => {
      const agent = new Agent();
      agent.agentId = 'wukong';
      agent.name = '孙悟空';
      agent.emoji = '🐵';
      agent.role = 'executor';
      agent.persona = 'Test persona';
      agent.model = 'claude-sonnet-4-6';
      agent.status = 'idle';

      expect(agent.agentId).toBe('wukong');
      expect(agent.role).toBe('executor');
      expect(agent.status).toBe('idle');
    });

    it('should have arrays for skills and capabilities', () => {
      const agent = new Agent();
      agent.skills = ['coding', 'testing'];
      agent.mcps = [];
      agent.capabilities = ['code_generation'];
      agent.boundaries = ['no production access'];

      expect(agent.skills).toEqual(['coding', 'testing']);
      expect(agent.capabilities).toContain('code_generation');
    });
  });

  describe('Conversation Entity', () => {
    it('should create a conversation message', () => {
      const conversation = new Conversation();
      conversation.sessionId = 'session-1';
      conversation.sender = 'user';
      conversation.senderId = 'user-1';
      conversation.senderName = 'User';
      conversation.type = 'text';
      conversation.content = 'Hello world';

      expect(conversation.sessionId).toBe('session-1');
      expect(conversation.sender).toBe('user');
      expect(conversation.type).toBe('text');
    });

    it('should support metadata', () => {
      const conversation = new Conversation();
      conversation.metadata = { key: 'value', count: 42 };

      expect(conversation.metadata.key).toBe('value');
      expect(conversation.metadata.count).toBe(42);
    });
  });

  describe('Checkpoint Entity', () => {
    it('should create a checkpoint', () => {
      const checkpoint = new Checkpoint();
      checkpoint.sessionId = 'session-1';
      checkpoint.agentId = 'agent-1';
      checkpoint.state = '{"key":"value"}';
      checkpoint.description = 'Test checkpoint';

      expect(checkpoint.sessionId).toBe('session-1');
      expect(checkpoint.agentId).toBe('agent-1');
      expect(checkpoint.state).toBe('{"key":"value"}');
    });
  });

  describe('ScheduledTask Entity', () => {
    it('should create a scheduled task', () => {
      const scheduledTask = new ScheduledTask();
      scheduledTask.sessionId = 'session-1';
      scheduledTask.name = 'Daily task';
      scheduledTask.type = 'interval';
      scheduledTask.prompt = 'Run daily check';
      scheduledTask.status = 'pending';

      expect(scheduledTask.type).toBe('interval');
      expect(scheduledTask.status).toBe('pending');
    });

    it('should support cron expression', () => {
      const scheduledTask = new ScheduledTask();
      scheduledTask.type = 'cron';
      scheduledTask.cronExpression = '0 9 * * *';

      expect(scheduledTask.cronExpression).toBe('0 9 * * *');
    });
  });

  describe('ExecutionLog Entity', () => {
    it('should create an execution log', () => {
      const log = new ExecutionLog();
      log.agentId = 'agent-1';
      log.level = 'info';
      log.message = 'Task completed successfully';

      expect(log.level).toBe('info');
      expect(log.message).toBe('Task completed successfully');
    });

    it('should support error stack trace', () => {
      const log = new ExecutionLog();
      log.level = 'error';
      log.message = 'Task failed';
      log.stackTrace = 'Error at line 1...';

      expect(log.level).toBe('error');
      expect(log.stackTrace).toBeDefined();
    });
  });
});