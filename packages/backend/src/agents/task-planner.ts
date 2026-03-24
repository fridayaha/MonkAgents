import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { AgentRole } from '@monkagents/shared';

/**
 * 任务规划步骤 - JSON格式
 */
export interface PlannedStep {
  stepId: number;
  taskName: string;
  agentRole: 'tangseng' | 'wukong' | 'bajie' | 'shaseng' | 'rulai';
  taskDetail: string;
  dependencies: number[];
  priority: 'high' | 'medium' | 'low';
}

/**
 * 任务规划结果 - JSON格式
 */
export interface TaskPlanResult {
  type: 'task' | 'chat' | 'help';
  analysis: string;
  steps: PlannedStep[];
  summary: string;
  needsHelp: boolean;
}

/**
 * 旧版任务分解步骤（兼容）
 */
export interface DecompositionStep {
  order: number;
  description: string;
  agentRole: AgentRole;
  agentId: string;
  dependencies: number[];
  estimatedComplexity: 'low' | 'medium' | 'high';
}

/**
 * 旧版任务分解结果（兼容）
 */
export interface DecompositionResult {
  steps: DecompositionStep[];
  summary: string;
  requiresReview: boolean;
}

/**
 * 任务规划提示词模板
 */
const PLANNING_PROMPT = `你是一个任务规划专家。请分析用户的请求，并以JSON格式返回规划结果。

【规划规则】
1. 如果是闲聊（问候、寒暄、简单问题），设置 type 为 "chat"，steps 为空数组
2. 如果是可执行任务，设置 type 为 "task"，并分解为具体步骤
3. 如果任务过于复杂或无法处理，设置 needsHelp 为 true，请求如来佛祖帮助

【智能体角色】
- tangseng (唐僧): 任务协调、需求分析、结果汇总
- wukong (孙悟空): 代码编写、调试、技术实现、命令执行
- bajie (猪八戒): 文档编写、格式整理、辅助任务、结果说明
- shaseng (沙和尚): 代码审查、测试验证、质量检查、执行确认
- rulai (如来佛祖): 架构设计、疑难问题、战略指导

【任务分解规则】
- 代码编写/修改任务：必须包含完整流程
  1. wukong（实现代码）
  2. shaseng（审查代码和验证结果）
  3. bajie（编写使用说明文档）
- 文件操作任务：由 wukong 执行，shaseng 确认结果，bajie 记录说明
- 测试任务：由 shaseng 执行测试，bajie 整理报告
- 文档任务：由 bajie 直接处理
- 简单命令执行：可由 wukong 直接完成

【重要】代码任务必须包含至少3个步骤：wukong实现 -> shaseng审查 -> bajie文档

【JSON格式】
{
  "type": "task" | "chat" | "help",
  "analysis": "任务分析说明",
  "steps": [
    {
      "stepId": 1,
      "taskName": "任务名称",
      "agentRole": "智能体ID",
      "taskDetail": "详细的任务说明（包含具体操作指令）",
      "dependencies": [],
      "priority": "high"
    }
  ],
  "summary": "规划总结",
  "needsHelp": false
}

【注意】
- 只返回JSON，不要包含其他文字或说明
- 将JSON放在 \`\`\`json 代码块中
- stepId 从 1 开始
- dependencies 是前置步骤的 stepId 数组
- taskDetail 中的字符串不要包含换行符，使用简短描述
- 确保所有字符串值都用双引号包围，不要有多余逗号

用户请求：{task}

请返回JSON格式的规划结果：`;

/**
 * 服务：任务规划器
 * 通过唐僧智能体进行智能任务规划
 */
@Injectable()
export class TaskPlanner {
  private readonly logger = new Logger(TaskPlanner.name);

  constructor() {}

  /**
   * 智能规划任务 - 通过唐僧智能体CLI调用
   */
  async planWithTangseng(userPrompt: string, workingDirectory?: string): Promise<TaskPlanResult> {
    const prompt = PLANNING_PROMPT.replace('{task}', userPrompt);

    try {
      const result = await this.callClaudeCLI(prompt, workingDirectory);
      const planResult = this.parsePlanResult(result);
      return planResult;
    } catch (error) {
      this.logger.error(`智能规划失败: ${error}`);
      // 返回默认规划 - 交给孙悟空处理
      return this.getDefaultPlan(userPrompt);
    }
  }

  /**
   * 创建清理后的环境变量（移除 Claude Code 会话变量以允许嵌套调用）
   */
  private getCleanEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    Object.keys(process.env).forEach(key => {
      // 移除所有 CLAUDECODE 和 CLAUDE_CODE 相关变量
      if (!key.startsWith('CLAUDECODE') && !key.startsWith('CLAUDE_CODE')) {
        env[key] = process.env[key] || '';
      }
    });
    return env;
  }

  /**
   * 调用 Claude CLI
   */
  private async callClaudeCLI(prompt: string, workingDirectory?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Determine the correct claude executable path
      let claudeCommand = 'claude';
      if (process.platform === 'win32') {
        // On Windows, prefer the official installation path (.local/bin/claude.exe)
        const localBin = path.join(process.env.USERPROFILE || '', '.local', 'bin', 'claude.exe');
        const npmClaude = path.join(process.env.APPDATA || '', 'npm', 'claude.cmd');

        if (fs.existsSync(localBin)) {
          claudeCommand = localBin;
        } else if (fs.existsSync(npmClaude)) {
          claudeCommand = npmClaude;
        }
      }

      const env = this.getCleanEnv();

      // Resolve working directory to absolute path
      let actualWorkingDir = workingDirectory
        ? (path.isAbsolute(workingDirectory) ? workingDirectory : path.resolve(process.cwd(), workingDirectory))
        : process.cwd();

      // Ensure working directory exists, otherwise fall back to cwd
      if (!fs.existsSync(actualWorkingDir)) {
        this.logger.warn(`工作目录不存在: ${actualWorkingDir}，使用当前目录: ${process.cwd()}`);
        actualWorkingDir = process.cwd();
      }

      const proc = spawn(claudeCommand, [
        '-p',
        '--output-format', 'text',
      ], {
        cwd: actualWorkingDir,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,  // Don't use shell when we have the exact path
      });

      // Write prompt to stdin only
      if (proc.stdin) {
        proc.stdin.write(prompt);
        proc.stdin.end();
      }

      let output = '';
      let error = '';

      proc.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        if (!text.includes('[TAIL]') && !text.includes('[WATCH]')) {
          error += text;
        }
      });

      proc.on('close', (code: number) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`CLI failed with code ${code}: ${error}`));
        }
      });

      proc.on('error', (err: Error) => {
        reject(err);
      });

      // 设置超时
      setTimeout(() => {
        proc.kill();
        reject(new Error('CLI timeout'));
      }, 60000);
    });
  }

  /**
   * 解析规划结果
   */
  private parsePlanResult(result: string): TaskPlanResult {
    // 尝试多种方式提取JSON
    let jsonStr: string | null = null;

    // 方法1: 查找 ```json 代码块
    const codeBlockMatch = result.match(/```json\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // 方法2: 查找最后一个完整的 JSON 对象
    if (!jsonStr) {
      // 找到最后一个 } 的位置
      let lastBrace = result.lastIndexOf('}');
      while (lastBrace > 0) {
        // 找到对应的起始 {
        let start = result.lastIndexOf('{', lastBrace);
        if (start >= 0) {
          const candidate = result.substring(start, lastBrace + 1);
          try {
            JSON.parse(candidate);
            jsonStr = candidate;
            break;
          } catch {
            // 继续查找
            lastBrace = result.lastIndexOf('}', lastBrace - 1);
          }
        } else {
          break;
        }
      }
    }

    // 方法3: 简单正则匹配
    if (!jsonStr) {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
    }

    if (!jsonStr) {
      this.logger.error(`无法从响应中提取JSON: ${result.substring(0, 500)}`);
      throw new Error('No JSON found in result');
    }

    // 清理 JSON 字符串中的常见问题
    jsonStr = this.cleanJsonString(jsonStr);

    try {
      const parsed = JSON.parse(jsonStr);

      // 验证并规范化
      const planResult: TaskPlanResult = {
        type: parsed.type || 'task',
        analysis: parsed.analysis || '',
        steps: (parsed.steps || []).map((step: any, index: number) => ({
          stepId: step.stepId || index + 1,
          taskName: step.taskName || `步骤${index + 1}`,
          agentRole: this.normalizeAgentRole(step.agentRole),
          taskDetail: step.taskDetail || step.description || '',
          dependencies: step.dependencies || [],
          priority: step.priority || 'medium',
        })),
        summary: parsed.summary || '',
        needsHelp: parsed.needsHelp || false,
      };

      return planResult;
    } catch (e) {
      this.logger.error(`JSON解析失败，原始内容: ${jsonStr?.substring(0, 300)}`);
      throw new Error(`Failed to parse JSON: ${e}`);
    }
  }

  /**
   * 清理 JSON 字符串中的常见问题
   */
  private cleanJsonString(jsonStr: string): string {
    // 移除控制字符
    let cleaned = jsonStr.replace(/[\x00-\x1F\x7F]/g, (char) => {
      if (char === '\n' || char === '\r' || char === '\t') return char;
      return '';
    });

    // 修复未转义的换行符在字符串值中
    // 这个正则会尝试找到字符串值中的裸换行符并转义它们
    cleaned = cleaned.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match, p1) => {
      if (p1.includes('\n') || p1.includes('\r')) {
        const escaped = p1
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t');
        return `"${escaped}"`;
      }
      return match;
    });

    return cleaned;
  }

  /**
   * 规范化智能体角色名称
   */
  private normalizeAgentRole(role: string): 'tangseng' | 'wukong' | 'bajie' | 'shaseng' | 'rulai' {
    const roleMap: Record<string, 'tangseng' | 'wukong' | 'bajie' | 'shaseng' | 'rulai'> = {
      'tangseng': 'tangseng',
      '唐僧': 'tangseng',
      'master': 'tangseng',
      'wukong': 'wukong',
      '孙悟空': 'wukong',
      'executor': 'wukong',
      'bajie': 'bajie',
      '猪八戒': 'bajie',
      'assistant': 'bajie',
      'shaseng': 'shaseng',
      '沙和尚': 'shaseng',
      '沙僧': 'shaseng',
      'inspector': 'shaseng',
      'rulai': 'rulai',
      '如来': 'rulai',
      '如来佛祖': 'rulai',
      'advisor': 'rulai',
    };
    return roleMap[role?.toLowerCase()] || 'wukong';
  }

  /**
   * 获取默认规划（降级方案）
   */
  private getDefaultPlan(userPrompt: string): TaskPlanResult {
    return {
      type: 'task',
      analysis: '任务规划服务暂时不可用，使用默认分配',
      steps: [
        {
          stepId: 1,
          taskName: '执行任务',
          agentRole: 'wukong',
          taskDetail: userPrompt,
          dependencies: [],
          priority: 'medium',
        },
      ],
      summary: '默认分配给孙悟空执行',
      needsHelp: false,
    };
  }

  /**
   * 将新的规划结果转换为旧版格式（兼容）
   */
  convertToDecompositionResult(planResult: TaskPlanResult): DecompositionResult {
    const roleToAgentRole: Record<string, AgentRole> = {
      'tangseng': 'master',
      'wukong': 'executor',
      'bajie': 'assistant',
      'shaseng': 'inspector',
      'rulai': 'advisor',
    };

    const steps: DecompositionStep[] = planResult.steps.map((step, index) => ({
      order: index,
      description: step.taskDetail,
      agentRole: roleToAgentRole[step.agentRole] || 'executor',
      agentId: step.agentRole,
      dependencies: step.dependencies.map(d => d - 1), // 转换为0-based索引
      estimatedComplexity: step.priority === 'high' ? 'high' : step.priority === 'low' ? 'low' : 'medium',
    }));

    return {
      steps,
      summary: planResult.summary,
      requiresReview: planResult.needsHelp || planResult.steps.length > 3,
    };
  }

  /**
   * 旧版分解方法（兼容）
   */
  async decompose(userPrompt: string): Promise<DecompositionResult> {
    const planResult = await this.planWithTangseng(userPrompt);
    return this.convertToDecompositionResult(planResult);
  }

  /**
   * 获取智能体ID
   */
  getAgentByRole(role: AgentRole): string {
    const mapping: Record<AgentRole, string> = {
      master: 'tangseng',
      executor: 'wukong',
      inspector: 'shaseng',
      assistant: 'bajie',
      advisor: 'rulai',
    };
    return mapping[role] || 'wukong';
  }

  /**
   * 判断是否需要人工审核
   */
  needsHumanReview(prompt: string, complexity: 'low' | 'medium' | 'high'): boolean {
    const lowerPrompt = prompt.toLowerCase();

    if (complexity === 'high') return true;

    const securityKeywords = ['安全', '权限', '密码', '认证', 'security', 'auth', 'password', 'permission'];
    if (securityKeywords.some(k => lowerPrompt.includes(k))) return true;

    const dataKeywords = ['数据库', '删除', '迁移', 'database', 'delete', 'migration'];
    if (dataKeywords.some(k => lowerPrompt.includes(k))) return true;

    return false;
  }
}