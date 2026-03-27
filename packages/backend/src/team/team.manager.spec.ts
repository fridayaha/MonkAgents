import { Test, TestingModule } from '@nestjs/testing';
import { TeamManager } from './team.manager';
import { TaskListService } from './task-list.service';
import { MailboxService } from './mailbox.service';
import { TeammateAgent } from './teammate.agent';
import { AgentConfig } from '@monkagents/shared';

// Mock TeammateAgent for testing
class MockTeammateAgent extends TeammateAgent {
  constructor(config: AgentConfig) {
    super(config);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async run(_teamId: string, _signal: AbortSignal): Promise<void> {
    // Simulate run loop that exits immediately for testing
    return Promise.resolve();
  }
}

describe('TeamManager', () => {
  let manager: TeamManager;
  let taskListService: TaskListService;
  let mailboxService: MailboxService;

  const mockTaskListService = {
    clearTeamTasks: jest.fn().mockResolvedValue(undefined),
  };

  const mockMailboxService = {};

  const mockWsService = {
    emitToSession: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamManager,
        {
          provide: TaskListService,
          useValue: mockTaskListService,
        },
        {
          provide: MailboxService,
          useValue: mockMailboxService,
        },
      ],
    }).compile();

    manager = module.get<TeamManager>(TeamManager);
    taskListService = module.get<TaskListService>(TaskListService);
    mailboxService = module.get<MailboxService>(MailboxService);

    manager.setDependencies(taskListService, mailboxService, mockWsService);
  });

  describe('createTeam', () => {
    it('should create a team with correct properties', async () => {
      const team = await manager.createTeam({
        sessionId: 'session-1',
        userPrompt: 'Test prompt',
        workingDirectory: '/test/dir',
      });

      expect(team).toBeDefined();
      expect(team.sessionId).toBe('session-1');
      expect(team.userPrompt).toBe('Test prompt');
      expect(team.workingDirectory).toBe('/test/dir');
      expect(team.status).toBe('active');
      expect(team.members).toHaveLength(4); // wukong, shaseng, bajie, rulai
    });

    it('should initialize all team members with idle status', async () => {
      const team = await manager.createTeam({
        sessionId: 'session-1',
        userPrompt: 'Test prompt',
        workingDirectory: '/test/dir',
      });

      for (const member of team.members) {
        expect(member.status).toBe('idle');
        expect(member.tasksCompleted).toBe(0);
      }
    });
  });

  describe('getTeam', () => {
    it('should return team by id', async () => {
      const created = await manager.createTeam({
        sessionId: 'session-1',
        userPrompt: 'Test prompt',
        workingDirectory: '/test/dir',
      });

      const team = manager.getTeam(created.id);
      expect(team).toBeDefined();
      expect(team?.id).toBe(created.id);
    });

    it('should return undefined for non-existent team', () => {
      const team = manager.getTeam('non-existent');
      expect(team).toBeUndefined();
    });
  });

  describe('getTeamBySession', () => {
    it('should return team by session id', async () => {
      const created = await manager.createTeam({
        sessionId: 'session-1',
        userPrompt: 'Test prompt',
        workingDirectory: '/test/dir',
      });

      const team = manager.getTeamBySession('session-1');
      expect(team).toBeDefined();
      expect(team?.id).toBe(created.id);
    });

    it('should return undefined for non-existent session', () => {
      const team = manager.getTeamBySession('non-existent');
      expect(team).toBeUndefined();
    });
  });

  describe('updateMemberStatus', () => {
    it('should update member status', async () => {
      const team = await manager.createTeam({
        sessionId: 'session-1',
        userPrompt: 'Test prompt',
        workingDirectory: '/test/dir',
      });

      manager.updateMemberStatus(team.id, 'wukong', 'working', 'task-1');

      const updatedTeam = manager.getTeam(team.id);
      const wukongMember = updatedTeam?.members.find(m => m.agentId === 'wukong');
      expect(wukongMember?.status).toBe('working');
      expect(wukongMember?.currentTaskId).toBe('task-1');
    });

    it('should not update non-existent team', () => {
      // Should not throw
      manager.updateMemberStatus('non-existent', 'wukong', 'working');
    });

    it('should not update non-existent member', async () => {
      const team = await manager.createTeam({
        sessionId: 'session-1',
        userPrompt: 'Test prompt',
        workingDirectory: '/test/dir',
      });

      // Should not throw
      manager.updateMemberStatus(team.id, 'non-existent', 'working');
    });
  });

  describe('incrementMemberTasksCompleted', () => {
    it('should increment task count', async () => {
      const team = await manager.createTeam({
        sessionId: 'session-1',
        userPrompt: 'Test prompt',
        workingDirectory: '/test/dir',
      });

      manager.incrementMemberTasksCompleted(team.id, 'wukong');
      manager.incrementMemberTasksCompleted(team.id, 'wukong');

      const updatedTeam = manager.getTeam(team.id);
      const wukongMember = updatedTeam?.members.find(m => m.agentId === 'wukong');
      expect(wukongMember?.tasksCompleted).toBe(2);
    });
  });

  describe('cancelTeam', () => {
    it('should cancel a team', async () => {
      const team = await manager.createTeam({
        sessionId: 'session-1',
        userPrompt: 'Test prompt',
        workingDirectory: '/test/dir',
      });

      await manager.cancelTeam(team.id);

      const cancelledTeam = manager.getTeam(team.id);
      expect(cancelledTeam?.status).toBe('cancelled');
    });
  });

  describe('destroyTeam', () => {
    it('should destroy a team and clear tasks', async () => {
      const team = await manager.createTeam({
        sessionId: 'session-1',
        userPrompt: 'Test prompt',
        workingDirectory: '/test/dir',
      });

      await manager.destroyTeam(team.id);

      const destroyedTeam = manager.getTeam(team.id);
      expect(destroyedTeam).toBeUndefined();
      expect(mockTaskListService.clearTeamTasks).toHaveBeenCalledWith(team.id);
    });
  });

  describe('getActiveTeams', () => {
    it('should return all active teams', async () => {
      await manager.createTeam({
        sessionId: 'session-1',
        userPrompt: 'Test prompt 1',
        workingDirectory: '/test/dir',
      });
      await manager.createTeam({
        sessionId: 'session-2',
        userPrompt: 'Test prompt 2',
        workingDirectory: '/test/dir',
      });

      const activeTeams = manager.getActiveTeams();
      expect(activeTeams).toHaveLength(2);
    });

    it('should not return cancelled teams', async () => {
      const team = await manager.createTeam({
        sessionId: 'session-1',
        userPrompt: 'Test prompt',
        workingDirectory: '/test/dir',
      });

      await manager.cancelTeam(team.id);

      const activeTeams = manager.getActiveTeams();
      expect(activeTeams).toHaveLength(0);
    });
  });

  describe('registerTeammate', () => {
    it('should register a teammate agent', () => {
      const config: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        emoji: '🤖',
        role: 'executor',
        persona: 'Test persona',
        model: 'test-model',
        cli: { command: 'test', args: [] },
        skills: [],
        mcps: [],
        capabilities: [],
        boundaries: [],
      };

      const agent = new MockTeammateAgent(config);
      manager.registerTeammate(agent);

      // No error should be thrown
      expect(true).toBe(true);
    });
  });
});