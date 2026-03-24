import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '../config/config.service';
import { Agent } from '../database/entities/agent.entity';
import { AgentConfig, AgentStatus, AgentState } from '@monkagents/shared';
import { TangsengAgent } from './tangseng.agent';
import { WukongAgent } from './wukong.agent';
import { BajieAgent } from './bajie.agent';
import { ShasengAgent } from './shaseng.agent';
import { RulaiAgent } from './rulai.agent';
import { ExecutableAgentBase } from './executable-agent-base';
import { WebSocketService } from '../websocket/websocket.service';
import { AgentRegistry } from './agent-registry.service';
import { BaseAgentService } from './base-agent.service';

/**
 * 智能体选择结果
 */
export interface AgentSelectionResult {
  agentId: string;
  agentName: string;
  weight: number;
  reason: string;
}

@Injectable()
export class AgentsService implements OnModuleInit {
  private readonly logger = new Logger(AgentsService.name);
  private agentStates: Map<string, AgentState> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly agentRegistry: AgentRegistry,
    private readonly tangsengAgent: TangsengAgent,
    private readonly wukongAgent: WukongAgent,
    private readonly bajieAgent: BajieAgent,
    private readonly shasengAgent: ShasengAgent,
    private readonly rulaiAgent: RulaiAgent,
    @InjectRepository(Agent)
    private readonly agentRepository: Repository<Agent>,
  ) {}

  /**
   * Set WebSocket service on all executable agents
   * Called from WebSocketGateway afterInit
   */
  async setWebSocketService(wsService: WebSocketService): Promise<void> {
    // Wait for all agents to be properly initialized before registering them
    await Promise.all([
      this.waitForInitialization(this.tangsengAgent),
      this.waitForInitialization(this.wukongAgent),
      this.waitForInitialization(this.bajieAgent),
      this.waitForInitialization(this.shasengAgent),
      this.waitForInitialization(this.rulaiAgent),
    ]);

    // Register all agents with the registry
    this.agentRegistry.registerAgent(this.tangsengAgent);
    this.agentRegistry.registerAgent(this.wukongAgent);
    this.agentRegistry.registerAgent(this.bajieAgent);
    this.agentRegistry.registerAgent(this.shasengAgent);
    this.agentRegistry.registerAgent(this.rulaiAgent);

    // Set WebSocket service on all agents
    this.wukongAgent.setWebSocketService(wsService);
    this.bajieAgent.setWebSocketService(wsService);
    this.shasengAgent.setWebSocketService(wsService);
    this.rulaiAgent.setWebSocketService(wsService);

    // Note: Tangseng doesn't directly execute CLI commands, so we might not need WebSocket service
    // depending on implementation, but for consistency we'll set it
    this.tangsengAgent.setWebSocketService(wsService);

    this.logger.log('WebSocket service set on all agents and agents registered with registry');
  }

  /**
   * Wait for an agent to be properly initialized (has valid ID)
   */
  private async waitForInitialization(agent: BaseAgentService): Promise<void> {
    let attempts = 0;
    const maxAttempts = 10; // 1 second total wait time
    const waitInterval = 100; // 100ms between attempts

    while (attempts < maxAttempts) {
      try {
        const id = agent.getId();
        if (id && id !== '') {
          return; // Successfully initialized
        }
      } catch (e) {
        // getId() might throw if config is not initialized yet
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, waitInterval));
    }

    this.logger.warn(`Agent ${agent.constructor.name} failed to initialize within timeout`);
  }

  async onModuleInit() {
    await this.initializeAgents();
  }

  private async initializeAgents(): Promise<void> {
    const configs = this.configService.getAllAgentConfigs();

    for (const config of configs) {
      // Check if agent already exists in database
      let agent = await this.agentRepository.findOne({
        where: { agentId: config.id },
      });

      if (!agent) {
        // Create new agent record
        agent = this.agentRepository.create({
          agentId: config.id,
          name: config.name,
          emoji: config.emoji,
          role: config.role,
          persona: config.persona,
          model: config.model,
          cli: config.cli,
          skills: config.skills,
          mcps: config.mcps,
          capabilities: config.capabilities,
          boundaries: config.boundaries,
          status: 'idle',
        });
        await this.agentRepository.save(agent);
        this.logger.log(`Created agent: ${config.id}`);
      }

      // Initialize runtime state
      this.agentStates.set(config.id, {
        id: config.id,
        config,
        status: 'idle',
      });
    }
  }

  async getAllAgents(): Promise<AgentState[]> {
    return Array.from(this.agentStates.values());
  }

  async getAgent(agentId: string): Promise<AgentState | undefined> {
    return this.agentStates.get(agentId);
  }

  async getAgentConfig(agentId: string): Promise<AgentConfig | undefined> {
    return this.configService.getAgentConfig(agentId);
  }

  async updateAgentStatus(agentId: string, status: AgentStatus): Promise<void> {
    const state = this.agentStates.get(agentId);
    if (state) {
      state.status = status;
      state.lastActivity = new Date();
      this.agentStates.set(agentId, state);

      // Update database
      await this.agentRepository.update(
        { agentId },
        { status, lastActivity: new Date() },
      );
    }
  }

  async assignTask(agentId: string, taskId: string): Promise<void> {
    const state = this.agentStates.get(agentId);
    if (state) {
      state.currentTaskId = taskId;
      state.status = 'thinking';
      this.agentStates.set(agentId, state);

      await this.agentRepository.update(
        { agentId },
        { currentTaskId: taskId, status: 'thinking', lastActivity: new Date() },
      );
    }
  }

  async releaseAgent(agentId: string): Promise<void> {
    const state = this.agentStates.get(agentId);
    if (state) {
      state.currentTaskId = undefined;
      state.status = 'idle';
      this.agentStates.set(agentId, state);

      await this.agentRepository.update(
        { agentId },
        { currentTaskId: null, status: 'idle', lastActivity: new Date() },
      );
    }
  }

  async getAvailableAgents(): Promise<AgentState[]> {
    return Array.from(this.agentStates.values()).filter(
      (agent) => agent.status === 'idle',
    );
  }

  async getAgentsByRole(role: string): Promise<AgentState[]> {
    return Array.from(this.agentStates.values()).filter(
      (agent) => agent.config.role === role,
    );
  }

  /**
   * 获取可执行智能体实例
   */
  getExecutableAgent(agentId: string): ExecutableAgentBase | undefined {
    return this.agentRegistry.getExecutableAgent(agentId) as ExecutableAgentBase;
  }

  /**
   * 选择最适合执行任务的智能体
   */
  selectBestAgent(task: string): AgentSelectionResult {
    const taskLower = task.toLowerCase();

    // Use the registry to find best agent
    const bestAgent = this.agentRegistry.findBestAgent(task);
    if (bestAgent) {
      return {
        agentId: bestAgent.getId(),
        agentName: bestAgent.getName(),
        weight: bestAgent.getPriorityWeight(task),
        reason: this.getAgentReason(bestAgent.getId(), taskLower),
      };
    }

    // If no agent can handle the task, default to Wukong
    return {
      agentId: 'wukong',
      agentName: '孙悟空',
      weight: 0.5,
      reason: '默认分配给孙悟空处理常规任务',
    };
  }

  /**
   * 获取选择智能体的原因
   */
  private getAgentReason(agentId: string, task: string): string {
    const reasons: Record<string, string> = {
      tangseng: '唐僧擅长任务规划、团队协调和结果审核',
      wukong: '孙悟空擅长代码编写、调试和技术任务',
      bajie: '猪八戒擅长文档编写、格式整理和辅助任务',
      shaseng: '沙和尚擅长代码审查、测试和质量保证',
      rulai: '如来佛祖擅长架构设计、技术咨询和复杂问题',
    };

    // 根据任务特点给出更具体的原因
    if (agentId === 'wukong') {
      if (task.includes('代码') || task.includes('实现')) {
        return '孙悟空最适合代码实现任务';
      }
      if (task.includes('debug') || task.includes('修复')) {
        return '孙悟空最适合调试和问题修复';
      }
    }

    if (agentId === 'shaseng') {
      if (task.includes('审查') || task.includes('review')) {
        return '沙和尚最适合代码审查任务';
      }
      if (task.includes('测试') || task.includes('test')) {
        return '沙和尚最适合测试验证任务';
      }
    }

    if (agentId === 'bajie') {
      if (task.includes('文档') || task.includes('doc')) {
        return '猪八戒最适合文档编写任务';
      }
      if (task.includes('格式') || task.includes('format')) {
        return '猪八戒最适合格式整理任务';
      }
    }

    if (agentId === 'rulai') {
      if (task.includes('架构') || task.includes('architecture')) {
        return '如来佛祖最适合架构设计任务';
      }
      if (task.includes('复杂') || task.includes('困难')) {
        return '如来佛祖最适合处理复杂问题';
      }
    }

    return reasons[agentId] || '根据能力匹配分配';
  }

  /**
   * 检查智能体是否可用
   */
  isAgentAvailable(agentId: string): boolean {
    const agent = this.agentRegistry.getExecutableAgent(agentId);
    return agent ? agent.isAvailable() : false;
  }

  /**
   * 获取所有智能体的状态摘要
   */
  getAgentsStatusSummary(): Record<string, { status: AgentStatus; available: boolean }> {
    const summary: Record<string, { status: AgentStatus; available: boolean }> = {};

    for (const agent of this.agentRegistry.getExecutableAgents()) {
      const state = this.agentStates.get(agent.getId());
      summary[agent.getId()] = {
        status: state?.status || 'idle',
        available: agent.isAvailable(),
      };
    }

    return summary;
  }
}