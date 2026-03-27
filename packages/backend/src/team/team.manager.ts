import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  Team,
  TeamMember,
  TeamMemberStatus,
  CreateTeamOptions,
  TeamStatusEvent,
  AgentRole,
} from './interfaces';
import { TaskListService } from './task-list.service';
import { MailboxService } from './mailbox.service';
import { TeammateAgent } from './teammate.agent';

/**
 * Agent configuration for team creation
 */
interface AgentConfig {
  id: string;
  name: string;
  role: AgentRole;
}

/**
 * Default agent configurations
 */
const DEFAULT_AGENTS: AgentConfig[] = [
  { id: 'wukong', name: '孙悟空', role: 'executor' },
  { id: 'shaseng', name: '沙和尚', role: 'inspector' },
  { id: 'bajie', name: '猪八戒', role: 'assistant' },
  { id: 'rulai', name: '如来佛祖', role: 'advisor' },
];

/**
 * Team Manager Service
 * Manages team lifecycle, creation, and destruction
 */
@Injectable()
export class TeamManager implements OnModuleDestroy {
  private readonly logger = new Logger(TeamManager.name);

  /** Active teams by team ID */
  private teams: Map<string, Team> = new Map();

  /** Teammate agents by agent ID */
  private teammates: Map<string, TeammateAgent> = new Map();

  /** Agent configs by agent ID */
  private agentConfigs: Map<string, AgentConfig> = new Map();

  /** Task list service */
  private taskListService: TaskListService | null = null;

  /** Mailbox service */
  protected mailboxService: MailboxService | null = null;

  /** WebSocket service for broadcasting */
  private wsService: any = null;

  /** Abort controllers for running teams */
  private abortControllers: Map<string, AbortController> = new Map();

  constructor() {
    // Initialize agent configs
    for (const agent of DEFAULT_AGENTS) {
      this.agentConfigs.set(agent.id, agent);
    }
  }

  /**
   * Set dependencies
   */
  setDependencies(
    taskListService: TaskListService,
    mailboxService: MailboxService,
    wsService: any,
  ): void {
    this.taskListService = taskListService;
    this.mailboxService = mailboxService;
    this.wsService = wsService;
  }

  /**
   * Register a teammate agent
   */
  registerTeammate(agent: TeammateAgent): void {
    this.teammates.set(agent.getId(), agent);
    this.logger.log(`Registered teammate: ${agent.getName()} (${agent.getId()})`);
  }

  /**
   * Unregister a teammate agent
   */
  unregisterTeammate(agentId: string): void {
    this.teammates.delete(agentId);
    this.logger.log(`Unregistered teammate: ${agentId}`);
  }

  /**
   * Create a new team
   */
  async createTeam(options: CreateTeamOptions): Promise<Team> {
    const teamId = uuidv4();

    // Create team members from default agents
    const members: TeamMember[] = DEFAULT_AGENTS.map(config => ({
      agentId: config.id,
      agentName: config.name,
      role: config.role,
      status: 'idle' as TeamMemberStatus,
      tasksCompleted: 0,
    }));

    const team: Team = {
      id: teamId,
      sessionId: options.sessionId,
      createdAt: new Date(),
      status: 'active',
      members,
      userPrompt: options.userPrompt,
      workingDirectory: options.workingDirectory,
    };

    this.teams.set(teamId, team);

    this.logger.log(`Created team ${teamId} for session ${options.sessionId}`);

    // Broadcast team creation
    this.broadcastTeamStatus(team);

    return team;
  }

  /**
   * Get team by ID
   */
  getTeam(teamId: string): Team | undefined {
    return this.teams.get(teamId);
  }

  /**
   * Get team by session ID
   */
  getTeamBySession(sessionId: string): Team | undefined {
    for (const team of this.teams.values()) {
      if (team.sessionId === sessionId) {
        return team;
      }
    }
    return undefined;
  }

  /**
   * Update team member status
   */
  updateMemberStatus(
    teamId: string,
    agentId: string,
    status: TeamMemberStatus,
    currentTaskId?: string,
  ): void {
    const team = this.teams.get(teamId);
    if (!team) return;

    const member = team.members.find(m => m.agentId === agentId);
    if (member) {
      member.status = status;
      member.currentTaskId = currentTaskId;

      // Broadcast status update
      this.broadcastTeamStatus(team);
    }
  }

  /**
   * Increment member's completed task count
   */
  incrementMemberTasksCompleted(teamId: string, agentId: string): void {
    const team = this.teams.get(teamId);
    if (!team) return;

    const member = team.members.find(m => m.agentId === agentId);
    if (member) {
      member.tasksCompleted++;
    }
  }

  /**
   * Start team execution (spawns all teammates)
   */
  async startTeam(teamId: string): Promise<void> {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    if (team.status !== 'active') {
      throw new Error(`Team ${teamId} is not active (status: ${team.status})`);
    }

    const abortController = new AbortController();
    this.abortControllers.set(teamId, abortController);

    this.logger.log(`Starting team ${teamId} with ${team.members.length} members`);

    // Start all teammate run loops in parallel
    const runPromises: Promise<void>[] = [];

    for (const member of team.members) {
      const teammate = this.teammates.get(member.agentId);
      if (teammate) {
        runPromises.push(
          teammate.run(teamId, abortController.signal).catch(error => {
            this.logger.error(`Teammate ${member.agentId} error: ${error}`);
          })
        );
      }
    }

    // Wait for all teammates to complete
    await Promise.all(runPromises);

    // Mark team as completed
    team.status = 'completed';
    this.broadcastTeamStatus(team);

    this.logger.log(`Team ${teamId} execution completed`);
  }

  /**
   * Cancel team execution
   */
  async cancelTeam(teamId: string): Promise<void> {
    const team = this.teams.get(teamId);
    if (!team) return;

    // Abort all running teammates
    const abortController = this.abortControllers.get(teamId);
    if (abortController) {
      abortController.abort();
    }

    // Update team status
    team.status = 'cancelled';

    // Broadcast cancellation
    this.broadcastTeamStatus(team);

    this.logger.log(`Team ${teamId} cancelled`);
  }

  /**
   * Destroy team and cleanup resources
   */
  async destroyTeam(teamId: string): Promise<void> {
    const team = this.teams.get(teamId);
    if (!team) return;

    // Cancel if still running
    await this.cancelTeam(teamId);

    // Clear task list
    if (this.taskListService) {
      await this.taskListService.clearTeamTasks(teamId);
    }

    // Remove from active teams
    this.teams.delete(teamId);
    this.abortControllers.delete(teamId);

    this.logger.log(`Team ${teamId} destroyed`);
  }

  /**
   * Broadcast team status to WebSocket clients
   */
  private broadcastTeamStatus(team: Team): void {
    if (!this.wsService) return;

    const event: TeamStatusEvent = {
      teamId: team.id,
      status: team.status,
      members: team.members.map(m => ({
        agentId: m.agentId,
        status: m.status,
        currentTaskId: m.currentTaskId,
        tasksCompleted: m.tasksCompleted,
      })),
      timestamp: new Date(),
    };

    this.wsService.emitToSession(team.sessionId, 'team_status', event);
  }

  /**
   * Get all active teams
   */
  getActiveTeams(): Team[] {
    return Array.from(this.teams.values()).filter(t => t.status === 'active');
  }

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    // Cancel all active teams
    for (const teamId of this.teams.keys()) {
      await this.destroyTeam(teamId);
    }
  }
}