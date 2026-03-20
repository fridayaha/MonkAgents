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
  private executableAgents: Map<string, ExecutableAgentBase> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly tangsengAgent: TangsengAgent,
    private readonly wukongAgent: WukongAgent,
    private readonly bajieAgent: BajieAgent,
    private readonly shasengAgent: ShasengAgent,
    private readonly rulaiAgent: RulaiAgent,
    @InjectRepository(Agent)
    private readonly agentRepository: Repository<Agent>,
  ) {
    // 注册所有可执行智能体（包括唐僧）
    this.executableAgents.set('tangseng', this.tangsengAgent);
    this.executableAgents.set('wukong', this.wukongAgent);
    this.executableAgents.set('bajie', this.bajieAgent);
    this.executableAgents.set('shaseng', this.shasengAgent);
    this.executableAgents.set('rulai', this.rulaiAgent);
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

      this.logger.debug(`Agent ${agentId} status updated to ${status}`);
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
    return this.executableAgents.get(agentId);
  }

  /**
   * 选择最适合执行任务的智能体
   */
  selectBestAgent(task: string): AgentSelectionResult {
    const taskLower = task.toLowerCase();
    const candidates: Array<{ agentId: string; weight: number; reason: string }> = [];

    // 遍历所有可执行智能体，计算优先级权重
    for (const [agentId, agent] of this.executableAgents) {
      if (agent.canHandle(task)) {
        // 使用类型断言来调用 getPriorityWeight 方法
        const weight = this.getAgentPriorityWeight(agentId, taskLower);
        const reason = this.getAgentReason(agentId, taskLower);
        candidates.push({ agentId, weight, reason });
      }
    }

    // 如果没有匹配的智能体，默认使用孙悟空
    if (candidates.length === 0) {
      return {
        agentId: 'wukong',
        agentName: '孙悟空',
        weight: 0.5,
        reason: '默认分配给孙悟空处理常规任务',
      };
    }

    // 按权重排序，选择最合适的
    candidates.sort((a, b) => b.weight - a.weight);
    const best = candidates[0];

    return {
      agentId: best.agentId,
      agentName: this.getAgentName(best.agentId),
      weight: best.weight,
      reason: best.reason,
    };
  }

  /**
   * 获取智能体名称
   */
  private getAgentName(agentId: string): string {
    const names: Record<string, string> = {
      tangseng: '唐僧',
      wukong: '孙悟空',
      bajie: '猪八戒',
      shaseng: '沙和尚',
      rulai: '如来佛祖',
    };
    return names[agentId] || agentId;
  }

  /**
   * 获取智能体优先级权重
   */
  private getAgentPriorityWeight(agentId: string, task: string): number {
    const weights: Record<string, number> = {
      tangseng: this.tangsengAgent.getPriorityWeight(task),
      wukong: this.wukongAgent.getPriorityWeight(task),
      bajie: this.bajieAgent.getPriorityWeight(task),
      shaseng: this.shasengAgent.getPriorityWeight(task),
      rulai: this.rulaiAgent.getPriorityWeight(task),
    };
    return weights[agentId] || 0.5;
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
    const agent = this.executableAgents.get(agentId);
    return agent ? agent.isAvailable() : false;
  }

  /**
   * 获取所有智能体的状态摘要
   */
  getAgentsStatusSummary(): Record<string, { status: AgentStatus; available: boolean }> {
    const summary: Record<string, { status: AgentStatus; available: boolean }> = {};

    for (const [agentId, agent] of this.executableAgents) {
      const state = this.agentStates.get(agentId);
      summary[agentId] = {
        status: state?.status || 'idle',
        available: agent.isAvailable(),
      };
    }

    return summary;
  }
}