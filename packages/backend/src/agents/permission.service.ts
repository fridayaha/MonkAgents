import { Injectable, Logger } from '@nestjs/common';
import {
  ToolCategory,
  PermissionRule,
  PermissionRequest,
  RememberedDecision,
  PermissionDenial,
  DANGEROUS_COMMAND_PATTERNS,
  SAFE_COMMAND_PATTERNS,
  TOOL_CATEGORY_MAP,
} from '@monkagents/shared';
import { ConfigService } from '../config/config.service';
import { RedisService } from '../redis/redis.service';
import { v4 as uuidv4 } from 'uuid';

/**
 * 权限决策结果
 */
export interface PermissionDecision {
  /** 决策结果 */
  action: 'auto_approve' | 'ask_user' | 'auto_deny';
  /** 匹配的规则 */
  matchedRule?: PermissionRule;
  /** 原因说明 */
  reason?: string;
}

/**
 * 权限服务
 * 负责工具执行权限的决策和管理
 */
@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * 获取智能体允许的工具列表（用于 --allowedTools 参数）
   * @param agentId 智能体ID
   * @param sessionId 会话ID（用于获取记住的决定）
   */
  async getAllowedTools(agentId: string, sessionId: string): Promise<string[]> {
    const agentConfig = this.configService.getAgentConfig(agentId);
    if (!agentConfig) {
      return [];
    }

    const allowedTools: string[] = [];

    // 1. 从智能体配置中获取自动确认的工具
    if (agentConfig.permissions?.autoApprove) {
      allowedTools.push(...agentConfig.permissions.autoApprove);
    }

    // 2. 从会话中获取记住的决定
    const remembered = await this.getRememberedDecisions(sessionId);
    for (const decision of remembered) {
      if (decision.action === 'allow' && !allowedTools.includes(decision.pattern)) {
        allowedTools.push(decision.pattern);
      }
    }

    // 3. 如果配置了tools，也自动允许这些工具
    if (agentConfig.tools) {
      for (const tool of agentConfig.tools) {
        if (!allowedTools.includes(tool)) {
          allowedTools.push(tool);
        }
      }
    }

    return [...new Set(allowedTools)]; // 去重
  }

  /**
   * 判断权限请求的处理方式
   */
  async decide(request: PermissionRequest): Promise<PermissionDecision> {
    // 1. 检查是否在记住的决定中
    const remembered = await this.getRememberedDecisions(request.sessionId);
    const rememberedDecision = this.matchRememberedDecision(request, remembered);
    if (rememberedDecision) {
      return {
        action: rememberedDecision.action === 'allow' ? 'auto_approve' : 'auto_deny',
        reason: `记住的决定: ${rememberedDecision.pattern}`,
      };
    }

    // 2. 检查智能体配置中的自动确认规则
    const agentConfig = this.configService.getAgentConfig(request.agentId);
    if (agentConfig?.permissions?.autoApprove) {
      const matchedRule = this.matchRule(request, agentConfig.permissions.autoApprove);
      if (matchedRule) {
        return {
          action: 'auto_approve',
          matchedRule,
          reason: matchedRule.description || '配置的自动确认规则',
        };
      }
    }

    // 3. 默认需要用户确认
    return {
      action: 'ask_user',
      reason: '未匹配到自动确认规则',
    };
  }

  /**
   * 对工具进行分类
   */
  categorizeTool(toolName: string, input: Record<string, unknown>): ToolCategory {
    // Bash需要特殊处理
    if (toolName === 'Bash') {
      const command = (input.command as string) || '';
      return this.categorizeBashCommand(command);
    }

    return TOOL_CATEGORY_MAP[toolName] || 'other';
  }

  /**
   * 对Bash命令进行分类
   */
  private categorizeBashCommand(command: string): ToolCategory {
    // 检查危险命令
    for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
      if (pattern.test(command)) {
        return 'bash_dangerous';
      }
    }

    // 检查安全命令
    for (const pattern of SAFE_COMMAND_PATTERNS) {
      if (pattern.test(command)) {
        return 'bash_safe';
      }
    }

    // 默认需要确认
    return 'bash_dangerous';
  }

  /**
   * 评估风险等级
   */
  assessRisk(request: PermissionRequest): 'low' | 'medium' | 'high' {
    const category = request.toolCategory;

    // 高风险
    if (category === 'bash_dangerous') {
      return 'high';
    }

    // 中等风险
    if (category === 'file_write' || category === 'agent') {
      return 'medium';
    }

    // 低风险
    if (category === 'file_read') {
      return 'low';
    }

    // 网络访问中等风险
    if (category === 'network') {
      // 检查URL
      const url = (request.input.url as string) || '';
      if (url.startsWith('https://')) {
        return 'medium';
      }
      return 'high';
    }

    return 'medium';
  }

  /**
   * 保存用户决定到Redis
   */
  async saveDecision(
    sessionId: string,
    pattern: string,
    action: 'allow' | 'deny',
  ): Promise<void> {
    const key = this.getRememberedKey(sessionId);
    const decision: RememberedDecision = {
      pattern,
      action,
      createdAt: new Date(),
    };

    try {
      // 获取现有决定
      const existing = await this.getRememberedDecisions(sessionId);

      // 检查是否已存在相同模式
      const existingIndex = existing.findIndex((d) => d.pattern === pattern);
      if (existingIndex >= 0) {
        existing[existingIndex] = decision;
      } else {
        existing.push(decision);
      }

      // 保存到Redis
      await this.redisService.set(key, JSON.stringify(existing));

      this.logger.log(`Saved permission decision for session ${sessionId}: ${pattern} -> ${action}`);
    } catch (error) {
      this.logger.error(`Failed to save permission decision: ${error}`);
    }
  }

  /**
   * 获取会话中记住的决定
   */
  async getRememberedDecisions(sessionId: string): Promise<RememberedDecision[]> {
    const key = this.getRememberedKey(sessionId);
    try {
      const data = await this.redisService.get(key);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      this.logger.error(`Failed to get remembered decisions: ${error}`);
    }
    return [];
  }

  /**
   * 从权限拒绝记录创建权限请求
   */
  createRequestFromDenial(
    denial: PermissionDenial,
    sessionId: string,
    agentId: string,
  ): PermissionRequest {
    const toolCategory = this.categorizeTool(denial.tool_name, denial.tool_input);

    const request: PermissionRequest = {
      id: uuidv4(),
      sessionId,
      agentId,
      toolName: denial.tool_name,
      toolCategory,
      input: denial.tool_input,
      timestamp: new Date(),
      risk: 'medium',
    };

    // 评估风险
    request.risk = this.assessRisk(request);

    return request;
  }

  /**
   * 匹配记住的决定
   */
  private matchRememberedDecision(
    request: PermissionRequest,
    decisions: RememberedDecision[],
  ): RememberedDecision | null {
    for (const decision of decisions) {
      // 精确匹配工具名
      if (decision.pattern === request.toolName) {
        return decision;
      }

      // 通配符匹配 Bash(command*)
      if (decision.pattern.startsWith('Bash(') && request.toolName === 'Bash') {
        const pattern = decision.pattern.slice(5, -1); // 提取括号内的模式
        const command = (request.input.command as string) || '';

        if (pattern.endsWith('*')) {
          // 前缀匹配
          const prefix = pattern.slice(0, -1);
          if (command.startsWith(prefix)) {
            return decision;
          }
        } else if (command === pattern) {
          return decision;
        }
      }
    }

    return null;
  }

  /**
   * 匹配规则
   */
  private matchRule(request: PermissionRequest, patterns: string[]): PermissionRule | null {
    for (const pattern of patterns) {
      // 精确匹配工具名
      if (pattern === request.toolName) {
        return {
          toolName: pattern,
          action: 'allow',
          description: `自动确认: ${pattern}`,
        };
      }

      // 通配符匹配 Bash(command*)
      if (pattern.startsWith('Bash(') && request.toolName === 'Bash') {
        const bashPattern = pattern.slice(5, -1);
        const command = (request.input.command as string) || '';

        if (bashPattern.endsWith('*')) {
          const prefix = bashPattern.slice(0, -1);
          if (command.startsWith(prefix)) {
            return {
              toolName: pattern,
              action: 'allow',
              description: `自动确认Bash命令: ${bashPattern}`,
            };
          }
        } else if (command === bashPattern) {
          return {
            toolName: pattern,
            action: 'allow',
            description: `自动确认Bash命令: ${bashPattern}`,
          };
        }
      }

      // 类别匹配 (file_read, network, etc.)
      if (pattern === request.toolCategory) {
        return {
          toolCategory: request.toolCategory,
          action: 'allow',
          description: `自动确认类别: ${pattern}`,
        };
      }
    }

    return null;
  }

  /**
   * 获取Redis键名
   */
  private getRememberedKey(sessionId: string): string {
    return `permission:remembered:${sessionId}`;
  }
}