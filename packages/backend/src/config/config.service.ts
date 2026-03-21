import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { AgentConfig, AgentRole } from '@monkagents/shared';

interface SystemConfig {
  database: {
    type: 'mysql';
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
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
  private systemConfig: SystemConfig;
  private agentConfigs: Map<string, AgentConfig> = new Map();

  constructor() {
    // Synchronously load config in constructor to ensure it's available before TypeORM initializes
    this.systemConfig = this.loadSystemConfigSync();
    this.loadAgentConfigsSync();
    this.logger.log(`Loaded ${this.agentConfigs.size} agent configurations`);
  }

  private loadSystemConfigSync(): SystemConfig {
    const configPaths = [
      join(process.cwd(), 'configs', 'system.yaml'),
      join(process.cwd(), '..', '..', 'configs', 'system.yaml'),
    ];

    for (const configPath of configPaths) {
      try {
        if (existsSync(configPath)) {
          const content = readFileSync(configPath, 'utf-8');
          const config = parse(content) as SystemConfig;
          this.logger.log(`System configuration loaded from: ${configPath}`);
          return config;
        }
      } catch (error) {
        this.logger.warn(`Failed to load config from ${configPath}: ${error}`);
      }
    }

    this.logger.warn('System configuration not found, using defaults');
    return this.getDefaultSystemConfig();
  }

  private loadAgentConfigsSync(): void {
    const agentsPaths = [
      join(process.cwd(), 'configs', 'agents'),
      join(process.cwd(), '..', '..', 'configs', 'agents'),
    ];

    let agentsPath: string | null = null;
    for (const path of agentsPaths) {
      if (existsSync(path)) {
        agentsPath = path;
        break;
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
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf-8');
          const config = parse(content) as AgentConfig;
          this.agentConfigs.set(config.id, config);
          this.logger.debug(`Loaded agent config: ${config.id}`);
        }
      } catch {
        this.logger.warn(`Agent config not found: ${file}`);
      }
    }
  }

  private getDefaultSystemConfig(): SystemConfig {
    return {
      database: {
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'root',
        password: '',
        database: 'monkagents',
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
    return this.systemConfig.server.port;
  }

  getServerHost(): string {
    return this.systemConfig.server.host;
  }

  getLogLevel(): string {
    return this.systemConfig.logging.level;
  }

  isDevelopment(): boolean {
    return process.env.NODE_ENV !== 'production';
  }

  getSystemConfig(): SystemConfig {
    return this.systemConfig;
  }

  /**
   * Get database configuration
   */
  getDatabaseConfig() {
    const db = this.systemConfig.database;
    return {
      host: db.host,
      port: db.port,
      username: db.username,
      password: db.password,
      database: db.database,
    };
  }

  /**
   * Get Redis configuration
   */
  getRedisConfig() {
    const redis = this.systemConfig?.redis;
    return {
      host: redis?.host || 'localhost',
      port: redis?.port || 6379,
      password: redis?.password,
      db: redis?.db || 0,
      keyPrefix: redis?.keyPrefix || 'monkagents:',
    };
  }
}