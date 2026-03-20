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
    // Check multiple possible locations for config
    const configPaths = [
      join(process.cwd(), 'configs', 'system.yaml'),
      join(process.cwd(), '..', '..', 'configs', 'system.yaml'),
    ];

    for (const configPath of configPaths) {
      try {
        await access(configPath);
        const content = await readFile(configPath, 'utf-8');
        this.systemConfig = parse(content) as SystemConfig;
        this.logger.log(`System configuration loaded from: ${configPath}`);
        break;
      } catch {
        // Try next path
      }
    }

    if (!this.systemConfig) {
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
    // Check multiple possible locations for agent configs
    const agentsPaths = [
      join(process.cwd(), 'configs', 'agents'),
      join(process.cwd(), '..', '..', 'configs', 'agents'),
    ];

    let agentsPath: string | null = null;
    for (const path of agentsPaths) {
      try {
        await access(path);
        agentsPath = path;
        break;
      } catch {
        // Try next path
      }
    }

    if (!agentsPath) {
      this.logger.warn('Agent configs directory not found');
      return;
    }

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
    const config = this.agentConfigs.get(agentId);
    if (!config) return undefined;

    // Override model from environment if set
    if (process.env.ANTHROPIC_MODEL) {
      return {
        ...config,
        model: process.env.ANTHROPIC_MODEL,
      };
    }

    return config;
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