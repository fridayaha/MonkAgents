import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { AgentConfig, AgentRole } from '@monkagents/shared';

/**
 * MCP Server configuration structure
 */
interface McpServerConfig {
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

/**
 * MCP configuration file structure
 */
interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

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
  private mcpConfigs: Map<string, McpConfig> = new Map();

  constructor() {
    // Synchronously load config in constructor to ensure it's available before TypeORM initializes
    this.systemConfig = this.loadSystemConfigSync();
    this.loadAgentConfigsSync();
    this.loadMcpConfigsSync();
    this.logger.log(`Loaded ${this.agentConfigs.size} agent configurations, ${this.mcpConfigs.size} MCP configurations`);
  }

  private loadSystemConfigSync(): SystemConfig {
    // 根据环境选择配置文件
    const isTest = process.env.NODE_ENV === 'test';

    const configPaths = isTest
      ? [
          // 测试环境优先加载测试配置
          join(process.cwd(), 'configs', 'system.test.yaml'),
          join(process.cwd(), '..', '..', 'configs', 'system.test.yaml'),
          // 回退到默认配置
          join(process.cwd(), 'configs', 'system.yaml'),
          join(process.cwd(), '..', '..', 'configs', 'system.yaml'),
        ]
      : [
          // 生产/开发环境
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
      'shaseng.yaml',
      'bajie.yaml',
      'rulai.yaml',
    ];

    for (const file of agentFiles) {
      const filePath = join(agentsPath, file);
      try {
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf-8');
          const config = parse(content) as AgentConfig;
          this.agentConfigs.set(config.id, config);
        }
      } catch {
        this.logger.warn(`Agent config not found: ${file}`);
      }
    }
  }

  /**
   * Load MCP configurations from configs/mcp/*.json
   */
  private loadMcpConfigsSync(): void {
    const mcpPaths = [
      join(process.cwd(), 'configs', 'mcp'),
      join(process.cwd(), '..', '..', 'configs', 'mcp'),
    ];

    let mcpPath: string | null = null;
    for (const path of mcpPaths) {
      if (existsSync(path)) {
        mcpPath = path;
        break;
      }
    }

    if (!mcpPath) {
      this.logger.log('MCP configs directory not found, skipping');
      return;
    }

    try {
      const files = readdirSync(mcpPath).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const filePath = join(mcpPath, file);
        try {
          let content = readFileSync(filePath, 'utf-8');
          // Replace environment variable placeholders like ${VAR_NAME}
          content = this.replaceEnvVariables(content);
          const config = JSON.parse(content) as McpConfig;
          // Use filename (without .json) as the key
          const key = file.replace('.json', '');
          this.mcpConfigs.set(key, config);
          this.logger.log(`Loaded MCP config: ${key}`);
        } catch (err) {
          this.logger.warn(`Failed to load MCP config: ${file}`);
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to read MCP configs directory: ${err}`);
    }
  }

  /**
   * Replace environment variable placeholders in a string
   * Supports ${VAR_NAME} and ${VAR_NAME:-default} syntax
   */
  private replaceEnvVariables(content: string): string {
    return content.replace(/\$\{([^}]+)\}/g, (match, varDef: string) => {
      // Check for default value syntax: VAR_NAME:-default
      const colonIndex = varDef.indexOf(':-');
      let varName: string;
      let defaultValue: string | undefined;

      if (colonIndex !== -1) {
        varName = varDef.substring(0, colonIndex).trim();
        defaultValue = varDef.substring(colonIndex + 2).trim();
      } else {
        varName = varDef.trim();
      }

      const envValue = process.env[varName];
      if (envValue !== undefined && envValue !== '') {
        return envValue;
      }
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      this.logger.warn(`Environment variable ${varName} is not set and no default value provided`);
      return match; // Return original if no value found
    });
  }

  /**
   * Get MCP configuration by name
   */
  getMcpConfig(name: string): McpConfig | undefined {
    return this.mcpConfigs.get(name);
  }

  /**
   * Get merged MCP configuration for a list of MCP names
   * Returns a single McpConfig with all servers merged
   */
  getMergedMcpConfig(mcpNames: string[]): McpConfig | null {
    if (!mcpNames || mcpNames.length === 0) {
      return null;
    }

    const merged: McpConfig = { mcpServers: {} };
    for (const name of mcpNames) {
      const config = this.mcpConfigs.get(name);
      if (config) {
        Object.assign(merged.mcpServers, config.mcpServers);
      } else {
        this.logger.warn(`MCP config not found: ${name}`);
      }
    }

    return merged.mcpServers ? merged : null;
  }

  /**
   * Get MCP configuration as JSON string for CLI --mcp-config parameter
   */
  getMcpConfigJson(mcpNames: string[]): string | null {
    const merged = this.getMergedMcpConfig(mcpNames);
    return merged ? JSON.stringify(merged) : null;
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