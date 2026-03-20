import { Injectable, Logger } from '@nestjs/common';
import { readFile, access, mkdir } from 'fs/promises';
import { join } from 'path';
import { parse } from 'yaml';
import { AgentConfig, AgentRole } from '@monkagents/shared';

interface SystemConfig {
  database: {
    type: 'sqlite' | 'postgres';
    path?: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    database?: string;
  };
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  logging: {
    level: string;
    format: 'json' | 'pretty';
  };
  server: {
    port: number;
    host: string;
  };
  agents: {
    configPath: string;
  };
}

@Injectable()
export class ConfigService {
  private readonly logger = new Logger(ConfigService.name);
  private systemConfig: SystemConfig | null = null;
  private agentConfigs: Map<string, AgentConfig> = new Map();

  async onModuleInit() {
    await this.loadSystemConfig();
    await this.loadAgentConfigs();
    this.logger.log(`Loaded ${this.agentConfigs.size} agent configurations`);
  }

  private async loadSystemConfig(): Promise<void> {
    const configPath = join(process.cwd(), 'configs', 'system.yaml');

    try {
      await access(configPath);
      const content = await readFile(configPath, 'utf-8');
      this.systemConfig = parse(content) as SystemConfig;
      this.logger.log('System configuration loaded');
    } catch {
      this.logger.warn('System configuration not found, using defaults');
      this.systemConfig = this.getDefaultSystemConfig();
    }

    // Ensure data directory exists
    const dataDir = join(process.cwd(), 'data', 'sqlite');
    try {
      await mkdir(dataDir, { recursive: true });
    } catch {
      // Directory already exists
    }
  }

  private async loadAgentConfigs(): Promise<void> {
    const agentsPath = join(process.cwd(), 'configs', 'agents');

    const agentFiles = [
      'tangseng.yaml',
      'wukong.yaml',
      'bajie.yaml',
      'shaseng.yaml',
      'rulai.yaml',
    ];

    for (const file of agentFiles) {
      const filePath = join(agentsPath, file);
      try {
        await access(filePath);
        const content = await readFile(filePath, 'utf-8');
        const config = parse(content) as AgentConfig;
        this.agentConfigs.set(config.id, config);
        this.logger.debug(`Loaded agent config: ${config.id}`);
      } catch {
        this.logger.warn(`Agent config not found: ${file}`);
      }
    }
  }

  private getDefaultSystemConfig(): SystemConfig {
    return {
      database: {
        type: 'sqlite',
        path: './data/sqlite/monkagents.db',
      },
      logging: {
        level: 'info',
        format: 'pretty',
      },
      server: {
        port: 3000,
        host: 'localhost',
      },
      agents: {
        configPath: './configs/agents',
      },
    };
  }

  getDatabasePath(): string {
    if (this.systemConfig?.database?.type === 'sqlite') {
      return join(process.cwd(), this.systemConfig.database.path || './data/sqlite/monkagents.db');
    }
    return join(process.cwd(), './data/sqlite/monkagents.db');
  }

  getAgentConfig(agentId: string): AgentConfig | undefined {
    return this.agentConfigs.get(agentId);
  }

  getAllAgentConfigs(): AgentConfig[] {
    return Array.from(this.agentConfigs.values());
  }

  getAgentIds(): string[] {
    return Array.from(this.agentConfigs.keys());
  }

  getAgentByRole(role: AgentRole): AgentConfig | undefined {
    return Array.from(this.agentConfigs.values()).find(
      (config) => config.role === role,
    );
  }

  getServerPort(): number {
    return this.systemConfig?.server?.port || 3000;
  }

  getServerHost(): string {
    return this.systemConfig?.server?.host || 'localhost';
  }

  getLogLevel(): string {
    return this.systemConfig?.logging?.level || 'info';
  }

  isDevelopment(): boolean {
    return process.env.NODE_ENV !== 'production';
  }

  getSystemConfig(): SystemConfig | null {
    return this.systemConfig;
  }
}