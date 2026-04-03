import { Injectable, Logger } from '@nestjs/common';
import { SessionService } from '../session/session.service';
import { TaskListService } from './task-list.service';
import { GoalService } from './goal.service';
import { TeamManager } from './team.manager';

export interface AgentFullContext {
  // Session information
  session: {
    id: string;
    workingDirectory: string;
    userPrompt: string;
    createdAt: Date;
  };

  // Team status
  team: {
    id: string;
    status: string;
    members: Array<{
      id: string;
      name: string;
      status: string;
      currentTask?: string;
    }>;
  };

  // Task overview
  tasks: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    currentTask?: {
      id: string;
      subject: string;
      description: string;
      priority: string;
    };
  };

  // Goal progress
  goals?: {
    overallProgress: number;
    summary: string;
  };

  // History summary
  history: {
    recentMessages: Array<{
      sender: string;
      content: string;
      timestamp: Date;
    }>;
    completedWork: string[];
    keyDecisions: string[];
  };

  // Available resources
  resources: {
    tools: string[];
    skills: string[];
    mcpServers: string[];
  };
}

/**
 * AgentContextService
 * Builds complete context for agent execution
 * Inspired by Paperclip's context passing design
 */
@Injectable()
export class AgentContextService {
  private readonly logger = new Logger(AgentContextService.name);

  // Services to be injected later
  private sessionService: SessionService | null = null;
  private taskListService: TaskListService | null = null;
  private goalService: GoalService | null = null;
  private teamManager: TeamManager | null = null;

  /** Session to team mapping cache */
  private sessionTeamMap: Map<string, string> = new Map();

  /**
   * Set session service
   */
  setSessionService(service: SessionService): void {
    this.sessionService = service;
  }

  /**
   * Set task list service
   */
  setTaskListService(service: TaskListService): void {
    this.taskListService = service;
  }

  /**
   * Set goal service
   */
  setGoalService(service: GoalService): void {
    this.goalService = service;
  }

  /**
   * Set team manager
   */
  setTeamManager(manager: TeamManager): void {
    this.teamManager = manager;
  }

  /**
   * Register session-team mapping
   */
  registerSessionTeam(sessionId: string, teamId: string): void {
    this.sessionTeamMap.set(sessionId, teamId);
  }

  /**
   * Unregister session-team mapping
   */
  unregisterSession(sessionId: string): void {
    this.sessionTeamMap.delete(sessionId);
  }

  /**
   * Build complete context for an agent
   */
  async buildContext(sessionId: string, agentId: string): Promise<AgentFullContext> {
    this.logger.debug(`Building context for agent ${agentId} in session ${sessionId}`);

    // 1. Get session information
    const session = await this.getSessionInfo(sessionId);

    // 2. Get team status
    const teamId = this.sessionTeamMap.get(sessionId) || '';
    const team = await this.getTeamStatus(teamId);

    // 3. Get task status
    const tasks = await this.getTasksSummary(teamId);

    // 4. Get goal progress
    const goals = this.getGoalProgress(teamId);

    // 5. Get history summary
    const history = await this.getHistorySummary(sessionId);

    // 6. Get available resources
    const resources = this.getResources(agentId);

    return {
      session,
      team,
      tasks,
      goals,
      history,
      resources,
    };
  }

  /**
   * Format context as prompt text
   */
  formatContextPrompt(context: AgentFullContext): string {
    const parts: string[] = [];

    // Session info
    parts.push(`【当前会话】
- 会话ID: ${context.session.id}
- 工作目录: ${context.session.workingDirectory}
- 用户需求: ${context.session.userPrompt || '（无）'}
- 创建时间: ${context.session.createdAt.toLocaleString()}`);

    // Team status
    if (context.team.id) {
      parts.push(`\n【团队状态】
- 团队ID: ${context.team.id}
- 状态: ${context.team.status}
- 成员:`);
      for (const member of context.team.members) {
        parts.push(`  - ${member.name} (${member.status})${member.currentTask ? ` - 执行任务: ${member.currentTask}` : ''}`);
      }
    }

    // Task overview
    parts.push(`\n【任务概览】
- 总任务数: ${context.tasks.total}
- 已完成: ${context.tasks.completed}
- 进行中: ${context.tasks.inProgress}
- 待处理: ${context.tasks.pending}`);

    if (context.tasks.currentTask) {
      parts.push(`\n【当前任务】
- 任务ID: ${context.tasks.currentTask.id}
- 标题: ${context.tasks.currentTask.subject}
- 描述: ${context.tasks.currentTask.description}
- 优先级: ${context.tasks.currentTask.priority}`);
    }

    // Goal progress
    if (context.goals) {
      parts.push(`\n【目标进度】
- 整体进度: ${context.goals.overallProgress}%
- 状态: ${context.goals.summary}`);
    }

    // Recent history
    if (context.history.recentMessages.length > 0) {
      parts.push(`\n【最近对话】`);
      for (const msg of context.history.recentMessages.slice(-5)) {
        const content = msg.content.length > 100 ? msg.content.slice(0, 100) + '...' : msg.content;
        parts.push(`  ${msg.sender}: ${content}`);
      }
    }

    // Completed work
    if (context.history.completedWork.length > 0) {
      parts.push(`\n【已完成工作】`);
      for (const work of context.history.completedWork.slice(-5)) {
        parts.push(`  - ${work}`);
      }
    }

    // Available resources
    parts.push(`\n【可用资源】
- 工具: ${context.resources.tools.join(', ') || '无'}
- 技能: ${context.resources.skills.join(', ') || '无'}
- MCP服务: ${context.resources.mcpServers.join(', ') || '无'}`);

    return parts.join('\n');
  }

  /**
   * Get session info
   */
  private async getSessionInfo(sessionId: string): Promise<AgentFullContext['session']> {
    const defaultSession = {
      id: sessionId,
      workingDirectory: process.cwd(),
      userPrompt: '',
      createdAt: new Date(),
    };

    if (!this.sessionService) {
      return defaultSession;
    }

    try {
      const session = await this.sessionService.findOne(sessionId);
      return {
        id: sessionId,
        workingDirectory: session.workingDirectory || process.cwd(),
        userPrompt: '', // Session config doesn't have userPrompt
        createdAt: session.createdAt,
      };
    } catch {
      return defaultSession;
    }
  }

  /**
   * Get team status
   */
  private async getTeamStatus(teamId: string): Promise<AgentFullContext['team']> {
    const emptyTeam = { id: '', status: '', members: [] };

    if (!teamId || !this.teamManager) {
      return emptyTeam;
    }

    try {
      // Simplified team status - TeamManager doesn't have getTeamStatus method
      // Return basic info from teamId
      return {
        id: teamId,
        status: 'active',
        members: [],
      };
    } catch {
      return emptyTeam;
    }
  }

  /**
   * Get tasks summary
   */
  private async getTasksSummary(teamId: string): Promise<AgentFullContext['tasks']> {
    const emptyTasks = { total: 0, completed: 0, inProgress: 0, pending: 0 };

    if (!teamId || !this.taskListService) {
      return emptyTasks;
    }

    try {
      const tasks = this.taskListService.getTeamTasks(teamId);
      const current = tasks.find(t => t.status === 'in_progress');

      return {
        total: tasks.length,
        completed: tasks.filter(t => t.status === 'completed').length,
        inProgress: tasks.filter(t => t.status === 'in_progress').length,
        pending: tasks.filter(t => t.status === 'pending').length,
        currentTask: current ? {
          id: current.id,
          subject: current.subject,
          description: current.description,
          priority: current.priority,
        } : undefined,
      };
    } catch {
      return emptyTasks;
    }
  }

  /**
   * Get goal progress
   */
  private getGoalProgress(teamId: string): AgentFullContext['goals'] | undefined {
    if (!teamId || !this.goalService) {
      return undefined;
    }

    try {
      const summary = this.goalService.getGoalSummary(teamId);
      return {
        overallProgress: summary.overallProgress,
        summary: `${summary.completed}/${summary.total} completed`,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Get history summary
   */
  private async getHistorySummary(sessionId: string): Promise<AgentFullContext['history']> {
    const emptyHistory = { recentMessages: [], completedWork: [], keyDecisions: [] };

    if (!this.sessionService) {
      return emptyHistory;
    }

    try {
      const messages = await this.sessionService.getSessionMessages(sessionId);

      return {
        recentMessages: messages.slice(-10).map(m => ({
          sender: m.senderName || m.sender,
          content: m.content,
          timestamp: m.createdAt,
        })),
        completedWork: messages
          .filter(m => m.type === 'tool_use' && m.metadata?.result)
          .slice(-5)
          .map(m => (m.metadata?.description as string) || '执行了操作'),
        keyDecisions: [],
      };
    } catch {
      return emptyHistory;
    }
  }

  /**
   * Get available resources for an agent
   */
  private getResources(_agentId: string): AgentFullContext['resources'] {
    // TODO: Get from agent config
    return {
      tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
      skills: [],
      mcpServers: [],
    };
  }
}