import { Injectable, Logger } from '@nestjs/common';
import { AgentConfig } from '@monkagents/shared';
import { ConfigService } from '../config/config.service';
import { BaseAgent, ExecutableAgent, AgentRegistrationOptions } from './interfaces/agent.interface';

@Injectable()
export class AgentRegistry {
  private readonly logger = new Logger(AgentRegistry.name);
  private agents: Map<string, { agent: BaseAgent; options: AgentRegistrationOptions }> = new Map();
  private agentConfigs: Map<string, AgentConfig> = new Map();

  constructor(private readonly configService: ConfigService) {
    this.loadAgentConfigs();
  }

  private loadAgentConfigs(): void {
    const configs = this.configService.getAllAgentConfigs();
    for (const config of configs) {
      this.agentConfigs.set(config.id, config);
    }
  }

  registerAgent(agent: BaseAgent, options: AgentRegistrationOptions = {}): void {
    const id = agent.getId();

    if (this.agents.has(id) && options.singleton) {
      this.logger.warn(`Singleton agent ${id} already registered, skipping registration`);
      return;
    }

    this.agents.set(id, { agent, options });
    this.logger.log(`Registered agent: ${id}`);
  }

  unregisterAgent(agentId: string): boolean {
    const result = this.agents.delete(agentId);
    if (result) {
      this.logger.log(`Unregistered agent: ${agentId}`);
    }
    return result;
  }

  private isValidAgent(agent: BaseAgent): boolean {
    try {
      // Check if the agent is properly initialized
      const id = agent.getId();
      return id != null && id !== '';
    } catch {
      // If getId() throws an error, agent is not properly initialized
      return false;
    }
  }

  getAgent(agentId: string): BaseAgent | undefined {
    const agentRecord = this.agents.get(agentId);
    const agent = agentRecord ? agentRecord.agent : undefined;

    // Check if agent is properly initialized
    if (agent && this.isValidAgent(agent)) {
      return agent;
    }

    return undefined;
  }

  getExecutableAgent(agentId: string): ExecutableAgent | undefined {
    const agent = this.getAgent(agentId); // This will only return properly initialized agents
    if (agent && this.isExecutableAgent(agent)) {
      return agent as ExecutableAgent;
    }
    return undefined;
  }

  private isExecutableAgent(agent: BaseAgent): agent is ExecutableAgent {
    return 'execute' in agent && typeof agent['execute'] === 'function';
  }

  getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values())
      .filter(record => this.isValidAgent(record.agent))
      .map(record => record.agent);
  }

  getExecutableAgents(): ExecutableAgent[] {
    return this.getAllAgents()
      .filter(agent => this.isExecutableAgent(agent))
      .map(agent => agent as ExecutableAgent);
  }

  getAgentConfig(agentId: string): AgentConfig | undefined {
    return this.agentConfigs.get(agentId);
  }

  getAvailableAgents(): ExecutableAgent[] {
    return this.getExecutableAgents().filter(agent => agent.isAvailable());
  }
}