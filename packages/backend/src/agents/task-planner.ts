import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { XmlParser } from './helpers/xml-parser';
import { ConfigService } from '../config/config.service';

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
 * 闲聊响应者配置
 */
export interface ChatResponder {
  agentRole: 'tangseng' | 'wukong' | 'bajie' | 'shaseng' | 'rulai';
  reason: string;  // 为什么选择这个智能体回答
  topic?: string;  // 该智能体应该回答的话题/角度
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
  // 闲聊模式专用字段
  chatResponders?: ChatResponder[];  // 由唐僧决定的响应者列表
  chatTopic?: string;  // 闲聊话题总结
}

/**
 * 任务规划提示词模板
 * 使用 XML 格式，对 LLM 更友好
 */
const PLANNING_PROMPT = `你是一个任务规划专家。请分析用户的请求，并以XML格式返回规划结果。

【规划规则】
1. 如果是闲聊（问候、寒暄、简单问题、日常对话），设置 type 为 "chat"
2. 如果是可执行任务，设置 type 为 "task"，并分解为具体步骤
3. 如果任务过于复杂或无法处理，设置 needsHelp 为 true，请求如来佛祖帮助

【智能体角色与专长】
- tangseng (唐僧): 团队协调、任务规划、佛学智慧、人生哲理、决策建议
- wukong (孙悟空): 技术实现、编程问题、调试排错、技术趋势、极客精神
- bajie (猪八戒): 文档整理、轻松话题、美食娱乐、生活趣事、幽默风趣
- shaseng (沙和尚): 质量检查、规范建议、稳重建议、踏实做事、勤恳态度
- rulai (如来佛祖): 架构设计、战略指导、深奥问题、因果分析、高深智慧

【闲聊模式规则】
当 type 为 "chat" 时，需要决定谁来回答：
1. 根据用户问题内容，选择最合适的智能体来回答
2. 可以选择单个智能体，也可以选择多个智能体从不同角度回答
3. 每个响应者要说明选择原因和回答角度
4. 如果是问候类消息，可以让所有智能体都来打个招呼

【任务分解规则】
- 代码编写/修改任务：必须包含完整流程
  1. wukong（实现代码）
  2. shaseng（审查代码和验证结果）
  3. bajie（编写使用说明文档）
- 文件操作任务：由 wukong 执行，shaseng 确认结果，bajie 记录说明
- 测试任务：由 shaseng 执行测试，bajie 整理报告
- 文档任务：由 bajie 直接处理
- 简单命令执行：可由 wukong 直接完成

【XML格式】
<task_plan>
  <type>task</type>
  <analysis>任务分析说明</analysis>
  <chatTopic>闲聊话题总结（仅chat模式）</chatTopic>
  <chatResponders>
    <responder>
      <agentRole>智能体ID</agentRole>
      <reason>选择原因</reason>
      <topic>回答角度/话题</topic>
    </responder>
  </chatResponders>
  <steps>
    <step>
      <stepId>1</stepId>
      <taskName>任务名称</taskName>
      <agentRole>智能体ID</agentRole>
      <taskDetail>详细的任务说明</taskDetail>
      <dependencies></dependencies>
      <priority>high</priority>
    </step>
  </steps>
  <summary>规划总结</summary>
  <needsHelp>false</needsHelp>
</task_plan>

【注意】
- 只返回XML，不要包含其他文字或说明
- 将XML放在 \`\`\`xml 代码块中
- stepId 从 1 开始
- dependencies 是前置步骤的 stepId，多个用逗号分隔，无依赖则留空
- chat模式下 steps 留空，chatResponders 必填

用户请求：{task}

请返回XML格式的规划结果：`;

/**
 * 服务：任务规划器
 * 通过唐僧智能体进行智能任务规划
 */
@Injectable()
export class TaskPlanner {
  private readonly logger = new Logger(TaskPlanner.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * 智能规划任务 - 通过唐僧智能体CLI调用
   */
  async planWithTangseng(userPrompt: string, workingDirectory?: string): Promise<TaskPlanResult> {
    const prompt = PLANNING_PROMPT.replace('{task}', userPrompt);

    try {
      const result = await this.callClaudeCLI(prompt, workingDirectory);

      // 检查结果是否完整（包含结束标记或完整JSON）
      if (!result || result.trim().length < 10) {
        this.logger.warn('CLI返回结果为空或过短，使用默认规划');
        return this.getDefaultPlan(userPrompt);
      }

      const planResult = this.parsePlanResult(result);

      // 打印规划结果摘要
      this.logger.log(`📋 任务规划结果:`);
      this.logger.log(`  类型: ${planResult.type}`);
      if (planResult.type === 'task') {
        this.logger.log(`  步骤数: ${planResult.steps.length}`);
        planResult.steps.forEach((step, i) => {
          this.logger.log(`  ${i + 1}. ${step.agentRole}: ${step.taskName}`);
        });
      } else if (planResult.type === 'chat' && planResult.chatResponders) {
        this.logger.log(`  响应者: ${planResult.chatResponders.map(r => r.agentRole).join(', ')}`);
      }
      if (planResult.needsHelp) {
        this.logger.log(`  ⚠️ 需要如来佛祖帮助`);
      }

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

      // 获取唐僧的模型配置
      const tangsengConfig = this.configService.getAgentConfig('tangseng');
      const model = tangsengConfig?.model;

      // 构建 CLI 参数
      const args = ['-p', '--output-format', 'text'];

      // 添加模型参数
      if (model) {
        args.push('--model', model);
        this.logger.debug(`使用模型: ${model}`);
      }

      const proc = spawn(claudeCommand, args, {
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
   * 优先尝试 XML 格式，失败后尝试 JSON 格式
   */
  private parsePlanResult(result: string): TaskPlanResult {
    // 方法1: 尝试解析 XML 格式
    const xmlResult = this.parseFromXml(result);
    if (xmlResult) {
      this.logger.debug('成功解析 XML 格式的规划结果');
      return xmlResult;
    }

    // 方法2: 尝试解析 JSON 格式（向后兼容）
    let jsonStr: string | null = null;

    // 查找 ```json 代码块
    const codeBlockMatch = result.match(/```json\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // 查找完整的 JSON 对象（使用栈匹配）
    if (!jsonStr) {
      jsonStr = this.extractCompleteJsonObject(result);
    }

    // 简单正则匹配（作为最后手段）
    if (!jsonStr) {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
    }

    if (!jsonStr) {
      this.logger.error(`无法从响应中提取有效数据: ${result.substring(0, 500)}`);
      throw new Error('No valid XML or JSON found in result');
    }

    // 清理 JSON 字符串中的常见问题
    jsonStr = this.cleanJsonString(jsonStr);

    try {
      const parsed = JSON.parse(jsonStr);
      return this.normalizePlanResult(parsed);
    } catch (e) {
      this.logger.error(`JSON解析失败，原始内容: ${jsonStr?.substring(0, 300)}`);
      this.logger.debug(`尝试修复JSON...`);

      // 尝试修复常见问题
      const fixedJson = this.tryFixJson(jsonStr);
      if (fixedJson) {
        try {
          const parsed = JSON.parse(fixedJson);
          this.logger.log('JSON修复成功');
          return this.normalizePlanResult(parsed);
        } catch {
          // 修复失败，抛出原始错误
        }
      }

      throw new Error(`Failed to parse plan result: ${e}`);
    }
  }

  /**
   * 从 XML 格式解析规划结果
   */
  private parseFromXml(result: string): TaskPlanResult | null {
    // 检查是否包含 task_plan XML 标签
    if (!XmlParser.hasXmlTag(result, 'task_plan')) {
      return null;
    }

    const xmlObj = XmlParser.parseFromCliOutput(result, 'task_plan');
    if (!xmlObj) {
      return null;
    }

    // 将 XML 对象转换为 TaskPlanResult 格式
    return this.normalizeFromXml(xmlObj);
  }

  /**
   * 将 XML 解析的对象规范化为 TaskPlanResult
   */
  private normalizeFromXml(xmlObj: Record<string, any>): TaskPlanResult {
    const steps = this.normalizeStepsFromXml(xmlObj.steps);
    const chatResponders = this.normalizeChatRespondersFromXml(xmlObj.chatResponders);

    return {
      type: xmlObj.type || 'task',
      analysis: xmlObj.analysis || '',
      steps,
      summary: xmlObj.summary || '',
      needsHelp: xmlObj.needsHelp === true || xmlObj.needsHelp === 'true',
      chatResponders: chatResponders.length > 0 ? chatResponders : undefined,
      chatTopic: xmlObj.chatTopic,
    };
  }

  /**
   * 从 XML 格式规范化步骤列表
   */
  private normalizeStepsFromXml(steps: any): PlannedStep[] {
    if (!steps || !steps.step) {
      return [];
    }

    const stepList = Array.isArray(steps.step) ? steps.step : [steps.step];

    return stepList.map((step: any, index: number) => ({
      stepId: typeof step.stepId === 'number' ? step.stepId : index + 1,
      taskName: step.taskName || `步骤${index + 1}`,
      agentRole: this.normalizeAgentRole(step.agentRole),
      taskDetail: step.taskDetail || step.description || '',
      dependencies: this.parseDependencies(step.dependencies),
      priority: step.priority || 'medium',
    }));
  }

  /**
   * 从 XML 格式规范化闲聊响应者列表
   */
  private normalizeChatRespondersFromXml(chatResponders: any): ChatResponder[] {
    if (!chatResponders || !chatResponders.responder) {
      return [];
    }

    const responderList = Array.isArray(chatResponders.responder)
      ? chatResponders.responder
      : [chatResponders.responder];

    return responderList.map((responder: any) => ({
      agentRole: this.normalizeAgentRole(responder.agentRole),
      reason: responder.reason || '',
      topic: responder.topic,
    }));
  }

  /**
   * 解析依赖项
   * XML 中可能是逗号分隔的字符串，或者已经是数组，或者是单个数字
   */
  private parseDependencies(deps: any): number[] {
    if (!deps && deps !== 0) {
      return [];
    }

    // 处理单个数字
    if (typeof deps === 'number') {
      return [deps];
    }

    if (Array.isArray(deps)) {
      return deps.map(d => (typeof d === 'number' ? d : parseInt(d, 10))).filter(n => !isNaN(n));
    }

    if (typeof deps === 'string') {
      const trimmed = deps.trim();
      if (!trimmed) {
        return [];
      }
      // 逗号分隔的字符串
      return trimmed
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n));
    }

    return [];
  }

  /**
   * 规范化 JSON 格式的规划结果
   */
  private normalizePlanResult(parsed: any): TaskPlanResult {
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

    // 解析闲聊模式的响应者
    if (parsed.type === 'chat' && parsed.chatResponders) {
      planResult.chatResponders = parsed.chatResponders.map((responder: any) => ({
        agentRole: this.normalizeAgentRole(responder.agentRole),
        reason: responder.reason || '',
        topic: responder.topic,
      }));
      planResult.chatTopic = parsed.chatTopic;
    }

    return planResult;
  }

  /**
   * 从文本中提取完整的 JSON 对象
   * 使用栈匹配确保提取完整的对象
   */
  private extractCompleteJsonObject(text: string): string | null {
    // 找到第一个 { 的位置
    const startIndex = text.indexOf('{');
    if (startIndex === -1) {
      return null;
    }

    // 使用栈来匹配括号
    let depth = 0;
    let inString = false;
    let escape = false;
    let endIndex = -1;

    for (let i = startIndex; i < text.length; i++) {
      const char = text[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\' && inString) {
        escape = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          depth++;
        } else if (char === '}') {
          depth--;
          if (depth === 0) {
            endIndex = i;
            break;
          }
        }
      }
    }

    if (endIndex === -1) {
      return null;
    }

    return text.substring(startIndex, endIndex + 1);
  }

  /**
   * 尝试修复不完整的 JSON
   */
  private tryFixJson(jsonStr: string): string | null {
    // 首先尝试简单补全括号
    let fixed = this.addMissingBrackets(jsonStr);

    try {
      JSON.parse(fixed);
      return fixed;
    } catch {
      // 简单补全失败，尝试更激进的修复
    }

    // 更激进的修复：移除最后一个不完整的元素
    const fixedJson = this.tryRemoveIncompleteElement(jsonStr);
    if (fixedJson) {
      try {
        JSON.parse(fixedJson);
        return fixedJson;
      } catch {
        // 仍然失败
      }
    }

    return fixed;
  }

  /**
   * 添加缺失的括号
   */
  private addMissingBrackets(jsonStr: string): string {
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escape = false;

    for (const char of jsonStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{') openBraces++;
        if (char === '}') openBraces--;
        if (char === '[') openBrackets++;
        if (char === ']') openBrackets--;
      }
    }

    // 如果在字符串中间截断，尝试关闭字符串
    if (inString) {
      jsonStr += '"';
    }

    // 补全缺失的括号
    while (openBrackets > 0) {
      jsonStr += ']';
      openBrackets--;
    }
    while (openBraces > 0) {
      jsonStr += '}';
      openBraces--;
    }

    return jsonStr;
  }

  /**
   * 尝试移除最后一个不完整的元素
   * 例如：{"a": 1, "b": [1, 2, "incomplete -> {"a": 1}
   */
  private tryRemoveIncompleteElement(jsonStr: string): string | null {
    // 找到最后一个完整的键值对
    // 策略：从后往前找，找到最后一个 }, ], 或完整值

    // 如果最后是 "key": 后面跟着不完整的值
    // 例如：..., "reason": "incomplete
    // 需要移除这个键值对

    // 找最后一个逗号的位置（不在字符串内的）
    // 但是要确保这个逗号后面没有完整的元素
    let lastCommaIndex = -1;
    let depth = 0;
    let inStr = false;
    let esc = false;

    for (let i = jsonStr.length - 1; i >= 0; i--) {
      const char = jsonStr[i];

      if (esc) {
        esc = false;
        continue;
      }
      if (char === '\\' && inStr) {
        esc = true;
        continue;
      }
      if (char === '"') {
        inStr = !inStr;
        continue;
      }
      if (!inStr) {
        if (char === '}' || char === ']') depth++;
        if (char === '{' || char === '[') depth--;
        if (char === ',' && depth === 0) {
          lastCommaIndex = i;
          break;
        }
      }
    }

    if (lastCommaIndex > 0) {
      // 截取到最后一个逗号之前的部分
      let truncated = jsonStr.substring(0, lastCommaIndex);

      // 补全括号
      truncated = this.addMissingBrackets(truncated);

      return truncated;
    }

    // 如果没找到逗号，尝试找最后一个闭合的对象
    const lastBraceIndex = jsonStr.lastIndexOf('}');
    if (lastBraceIndex > 0) {
      // 从这个位置往前找对应的开始括号
      let braceDepth = 0;
      for (let i = lastBraceIndex; i >= 0; i--) {
        if (jsonStr[i] === '}') braceDepth++;
        if (jsonStr[i] === '{') {
          braceDepth--;
          if (braceDepth === 0) {
            // 找到了完整的对象
            const completeObj = jsonStr.substring(i, lastBraceIndex + 1);

            // 检查这是否在一个数组中
            // 如果前面有 [ 或 , 说明在数组中
            let prefix = jsonStr.substring(0, i);
            let suffix = '';

            // 找到包含这个对象的完整上下文
            for (let j = i - 1; j >= 0; j--) {
              const c = jsonStr[j];
              if (c === '[') {
                // 在数组中
                prefix = jsonStr.substring(0, j + 1);
                suffix = ']';
                break;
              } else if (c === '{') {
                // 在对象中
                break;
              }
            }

            return prefix + completeObj + suffix + this.countNeededBrackets(prefix);
          }
        }
      }
    }

    return null;
  }

  /**
   * 计算需要补全的括号
   */
  private countNeededBrackets(jsonStr: string): string {
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escape = false;

    for (const char of jsonStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{') openBraces++;
        if (char === '}') openBraces--;
        if (char === '[') openBrackets++;
        if (char === ']') openBrackets--;
      }
    }

    let result = '';
    if (inString) result += '"';
    while (openBrackets > 0) {
      result += ']';
      openBrackets--;
    }
    while (openBraces > 0) {
      result += '}';
      openBraces--;
    }
    return result;
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
   * 获取智能体ID
   */
  getAgentByRole(role: 'master' | 'executor' | 'inspector' | 'assistant' | 'advisor'): string {
    const mapping = {
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