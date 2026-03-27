import { Test, TestingModule } from '@nestjs/testing';
import { WebSocketGateway } from './websocket.gateway';
import { WebSocketService } from './websocket.service';
import { TangsengAgent } from '../agents/tangseng.agent';
import { TasksService } from '../tasks/tasks.service';
import { TaskPlanner } from '../agents/task-planner';
import { AgentsService } from '../agents/agents.service';
import { SessionService } from '../session/session.service';
import { TeamLeadAgent } from '../team/team-lead.agent';
import { TeamManager } from '../team/team.manager';
import { TaskListService } from '../team/task-list.service';
import { MailboxService } from '../team/mailbox.service';
import { WukongAgent } from '../agents/wukong.agent';
import { BajieAgent } from '../agents/bajie.agent';
import { ShasengAgent } from '../agents/shaseng.agent';
import { RulaiAgent } from '../agents/rulai.agent';
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
    handleUserMessage: jest.fn().mockResolvedValue(undefined),
    cancelTask: jest.fn().mockResolvedValue(undefined),
    setServer: jest.fn(),
    setDependencies: jest.fn(),
    handlePermissionResponse: jest.fn().mockResolvedValue(undefined),
  };

  const mockTangsengAgent = {
    processUserMessage: jest.fn(),
    setDependencies: jest.fn(),
    cancelTask: jest.fn(),
  };

  const mockTasksService = {
    cancel: jest.fn(),
  };

  const mockTaskPlanner = {
    decomposeTask: jest.fn(),
  };

  const mockAgentsService = {
    getExecutableAgent: jest.fn(),
    selectBestAgent: jest.fn(),
    setWebSocketService: jest.fn().mockResolvedValue(undefined),
  };

  const mockSessionService = {
    findOne: jest.fn(),
  };

  // Team-related mocks
  const mockTeamLeadAgent = {
    setDependencies: jest.fn(),
    getTeamStatus: jest.fn(),
    cancelTeam: jest.fn().mockResolvedValue(undefined),
    processUserMessage: jest.fn().mockResolvedValue({}),
  };

  const mockTeamManager = {
    setDependencies: jest.fn(),
    registerTeammate: jest.fn(),
  };

  const mockTaskListService = {};

  const mockMailboxService = {};

  const mockWukongAgent = {
    setTeamServices: jest.fn(),
    setWebSocketService: jest.fn(),
  };

  const mockBajieAgent = {
    setTeamServices: jest.fn(),
    setWebSocketService: jest.fn(),
  };

  const mockShasengAgent = {
    setTeamServices: jest.fn(),
    setWebSocketService: jest.fn(),
  };

  const mockRulaiAgent = {
    setTeamServices: jest.fn(),
    setWebSocketService: jest.fn(),
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
        {
          provide: TangsengAgent,
          useValue: mockTangsengAgent,
        },
        {
          provide: TasksService,
          useValue: mockTasksService,
        },
        {
          provide: TaskPlanner,
          useValue: mockTaskPlanner,
        },
        {
          provide: AgentsService,
          useValue: mockAgentsService,
        },
        {
          provide: SessionService,
          useValue: mockSessionService,
        },
        // Team-related providers
        {
          provide: TeamLeadAgent,
          useValue: mockTeamLeadAgent,
        },
        {
          provide: TeamManager,
          useValue: mockTeamManager,
        },
        {
          provide: TaskListService,
          useValue: mockTaskListService,
        },
        {
          provide: MailboxService,
          useValue: mockMailboxService,
        },
        {
          provide: WukongAgent,
          useValue: mockWukongAgent,
        },
        {
          provide: BajieAgent,
          useValue: mockBajieAgent,
        },
        {
          provide: ShasengAgent,
          useValue: mockShasengAgent,
        },
        {
          provide: RulaiAgent,
          useValue: mockRulaiAgent,
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
    it('should handle user message', async () => {
      const data = { sessionId: 'session-123', content: 'Hello' };
      await gateway.handleMessage(mockSocket, data);
      expect(mockWebSocketService.handleUserMessage).toHaveBeenCalled();
    });
  });

  describe('handleCancel', () => {
    it('should cancel task', async () => {
      await gateway.handleCancel(mockSocket, 'task-123');
      expect(mockWebSocketService.cancelTask).toHaveBeenCalledWith('task-123');
    });
  });

  describe('handleTeamStatus', () => {
    it('should get team status', async () => {
      mockTeamLeadAgent.getTeamStatus.mockReturnValue({
        id: 'team-123',
        status: 'active',
        members: [],
      });

      await gateway.handleTeamStatus(mockSocket, { sessionId: 'session-123' });

      expect(mockTeamLeadAgent.getTeamStatus).toHaveBeenCalledWith('session-123');
      expect(mockSocket.emit).toHaveBeenCalledWith('team_status', expect.objectContaining({
        teamId: 'team-123',
        status: 'active',
      }));
    });

    it('should not emit if no team found', async () => {
      mockTeamLeadAgent.getTeamStatus.mockReturnValue(undefined);

      await gateway.handleTeamStatus(mockSocket, { sessionId: 'session-123' });

      expect(mockTeamLeadAgent.getTeamStatus).toHaveBeenCalledWith('session-123');
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('handleTeamCancel', () => {
    it('should cancel team', async () => {
      await gateway.handleTeamCancel(mockSocket, { sessionId: 'session-123' });
      expect(mockTeamLeadAgent.cancelTeam).toHaveBeenCalledWith('session-123');
    });
  });
});