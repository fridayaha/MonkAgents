import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '../config/config.service';
import { Agent } from '../database/entities/agent.entity';
import { AgentConfig, AgentStatus, AgentState } from '@monkagents/shared';

@Injectable()
export class AgentsService implements OnModuleInit {
  private readonly logger = new Logger(AgentsService.name);
  private agentStates: Map<string, AgentState> = new Map();

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Agent)
    private readonly agentRepository: Repository<Agent>,
  ) {}

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
}