import { AgentCollaborationService } from './agent-collaboration.service';
import { AgentsService } from './agents.service';
import { AgentMentionService } from './agent-mention.service';

describe('AgentCollaborationService', () => {
  let service: AgentCollaborationService;
  let mockAgentsService: jest.Mocked<AgentsService>;
  let mockMentionService: jest.Mocked<AgentMentionService>;

  beforeEach(() => {
    mockAgentsService = {
      selectBestAgent: jest.fn(),
      getExecutableAgent: jest.fn(),
      getAgentsStatusSummary: jest.fn(),
    } as any;

    mockMentionService = {
      getAgentName: jest.fn((id) => {
        const names: Record<string, string> = {
          wukong: '孙悟空',
          bajie: '猪八戒',
          shaseng: '沙和尚',
          rulai: '如来佛祖',
        };
        return names[id] || id;
      }),
    } as any;

    service = new AgentCollaborationService(mockAgentsService, mockMentionService);
  });

  describe('createCollaborationSession', () => {
    it('should create a session with specified agents', () => {
      const session = service.createCollaborationSession(
        'session-1',
        '写代码并审查',
        ['wukong', 'shaseng'],
      );

      expect(session.id).toBeDefined();
      expect(session.sessionId).toBe('session-1');
      expect(session.originalTask).toBe('写代码并审查');
      expect(session.steps).toHaveLength(2);
      expect(session.steps[0].agentId).toBe('wukong');
      expect(session.steps[1].agentId).toBe('shaseng');
      expect(session.steps[1].dependsOn).toEqual(['step-0']);
    });

    it('should create a session with auto-assigned agents', () => {
      mockAgentsService.selectBestAgent
        .mockReturnValueOnce({ agentId: 'wukong', agentName: '孙悟空', weight: 0.9, reason: 'test' })
        .mockReturnValueOnce({ agentId: 'shaseng', agentName: '沙和尚', weight: 0.85, reason: 'test' });

      const session = service.createCollaborationSession('session-1', '实现并审查代码');

      expect(session.steps.length).toBeGreaterThan(0);
    });
  });

  describe('getCollaborationSession', () => {
    it('should return session by id', () => {
      const created = service.createCollaborationSession(
        'session-1',
        'test task',
        ['wukong'],
      );

      const found = service.getCollaborationSession(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    it('should return undefined for non-existent session', () => {
      const found = service.getCollaborationSession('non-existent');
      expect(found).toBeUndefined();
    });
  });

  describe('getAllCollaborationSessions', () => {
    it('should return all sessions', async () => {
      // Clear existing sessions first
      const existingSessions = service.getAllCollaborationSessions();
      existingSessions.forEach(s => service.cancelCollaboration(s.id));

      const session1 = service.createCollaborationSession('session-1', 'task 1', ['wukong']);
      // Small delay to ensure unique timestamps for collaboration IDs
      await new Promise(resolve => setTimeout(resolve, 2));
      const session2 = service.createCollaborationSession('session-2', 'task 2', ['bajie']);

      const sessions = service.getAllCollaborationSessions();

      // Check that both sessions exist
      expect(sessions.find(s => s.id === session1.id)).toBeDefined();
      expect(sessions.find(s => s.id === session2.id)).toBeDefined();
    });
  });

  describe('cancelCollaboration', () => {
    it('should cancel a collaboration', () => {
      const session = service.createCollaborationSession(
        'session-1',
        'test task',
        ['wukong'],
      );

      service.cancelCollaboration(session.id);

      const found = service.getCollaborationSession(session.id);
      expect(found?.status).toBe('failed');
    });
  });

  describe('assignAgentsForTask', () => {
    it('should assign review agent for review task', () => {
      mockAgentsService.selectBestAgent.mockReturnValue({
        agentId: 'shaseng',
        agentName: '沙和尚',
        weight: 0.95,
        reason: '审查任务',
      });

      const assignments = service.assignAgentsForTask('审查代码质量');

      expect(assignments.length).toBeGreaterThan(0);
      expect(assignments.some(a => a.agentId === 'shaseng')).toBe(true);
    });

    it('should assign implementation agent for coding task', () => {
      mockAgentsService.selectBestAgent.mockReturnValue({
        agentId: 'wukong',
        agentName: '孙悟空',
        weight: 0.95,
        reason: '实现任务',
      });

      const assignments = service.assignAgentsForTask('实现新功能');

      expect(assignments.length).toBeGreaterThan(0);
    });

    it('should assign documentation agent for doc task', () => {
      mockAgentsService.selectBestAgent.mockReturnValue({
        agentId: 'bajie',
        agentName: '猪八戒',
        weight: 0.9,
        reason: '文档任务',
      });

      const assignments = service.assignAgentsForTask('编写文档');

      expect(assignments.some(a => a.agentId === 'bajie')).toBe(true);
    });
  });

  describe('generateCollaborationReport', () => {
    it('should generate a report for a session', () => {
      const session = service.createCollaborationSession(
        'session-1',
        'test task',
        ['wukong', 'shaseng'],
      );

      session.steps[0].status = 'completed';
      session.steps[0].result = { success: true, output: 'done' };
      session.steps[1].status = 'pending';

      const report = service.generateCollaborationReport(session);

      expect(report).toContain('协作任务报告');
      expect(report).toContain('test task');
      expect(report).toContain('孙悟空');
      expect(report).toContain('沙和尚');
    });
  });
});