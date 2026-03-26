import { Logger } from '@nestjs/common';
import {
  AgentConfig,
  AgentStatus,
  CliExecutionResult,
  CliOutputEvent,
  ExecutionSummary,
  FileChange,
  ExecutionSummaryBuilder,
  PermissionDenial,
  PermissionRequestMessage,
} from '@monkagents/shared';
import { AgentExecutionContext, AgentExecutionCallbacks, ExecutableAgent } from './interfaces/agent.interface';
import { CliExecutor, DEFAULT_CLI_EXECUTION_CONFIG, CliExecutionConfig } from './helpers/cli-executor';
import { SummaryParser } from './helpers/summary-parser';
import { PermissionService } from './permission.service';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// 导出类型以便其他模块可以使用
export { AgentExecutionContext, AgentExecutionCallbacks, ExecutableAgent };

/**
 * Base class for executable agents that can run CLI commands
 * Separates concerns by using CliExecutor helper class
 */
export abstract class ExecutableAgentBase implements ExecutableAgent {
  protected readonly logger: Logger;
  protected config: AgentConfig;
  protected status: AgentStatus = 'idle';
  protected wsService: any = null; // Using any to avoid circular dependency issues
  protected permissionService: PermissionService | null = null; // 权限服务
  private cliExecutor?: CliExecutor;  // Make it optional initially
  private executionConfig: CliExecutionConfig;

  // ===== 文件变更追踪 =====
  /** 执行前的文件快照: path -> hash */
  private fileSnapshot: Map<string, string> = new Map();
  /** 当前工作目录 */
  private currentWorkingDir: string = '';
  /** 排除的目录/文件 */
  private static readonly EXCLUDED_PATTERNS = [
    'node_modules', '.git', '.idea', '.vscode', 'dist', 'build',
    '.DS_Store', 'Thumbs.db', '.env', '.env.local', '.env.*.local',
  ];

  constructor(config: AgentConfig, executionConfig?: CliExecutionConfig) {
    this.config = config;
    this.logger = new Logger(`${config.name}Agent`);
    this.executionConfig = executionConfig || DEFAULT_CLI_EXECUTION_CONFIG;
    // Don't create CliExecutor in constructor since config might not be properly initialized yet
  }

  /**
   * Initialize the agent with configuration and setup CliExecutor
   * Should be called after the agent is properly configured
   */
  protected initializeAgent(config: AgentConfig): void {
    this.config = config;
    (this.logger as any).context = `${config.name}Agent`;
    // Now create CliExecutor with properly configured config
    this.cliExecutor = new CliExecutor(config, this.executionConfig);
  }

  /**
   * Set permission service
   */
  setPermissionService(service: PermissionService): void {
    this.permissionService = service;
  }

  /**
   * Ensure CliExecutor is available, lazy initialization
   */
  private ensureCliExecutor(): void {
    if (!this.cliExecutor) {
      this.logger.warn('CliExecutor not initialized, initializing with current config');
      this.cliExecutor = new CliExecutor(this.config, this.executionConfig);
    }
  }

  /**
   * Get agent ID
   */
  getId(): string {
    return this.config.id;
  }

  /**
   * Get agent name
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * Get agent configuration
   */
  getConfig(): AgentConfig {
    return this.config;
  }

  /**
   * Get current status
   */
  getStatus(): AgentStatus {
    return this.status;
  }

  /**
   * Set WebSocket service for streaming output
   */
  setWebSocketService(wsService: any): void {
    this.wsService = wsService;
  }

  /**
   * Get the system prompt for this agent
   * Combines persona with execution prompt configuration
   */
  protected getSystemPrompt(): string {
    return this.config.persona;
  }

  /**
   * Build the full prompt for CLI execution
   * Includes persona, task context, and execution instructions
   */
  protected buildPrompt(task: string, context?: AgentExecutionContext): string {
    const parts: string[] = [];

    // 1. Add persona (人设提示词)
    parts.push(this.getSystemPrompt());

    // 2. Add working directory context
    if (context?.sessionWorkingDirectory) {
      parts.push(`\n【工作目录】\n当前项目根目录: ${context.sessionWorkingDirectory}`);
      parts.push(`所有文件操作应在此目录下进行。`);
    }

    // 3. Add task context (任务级上下文 - 新增)
    if (context?.taskContext) {
      parts.push(`\n【任务背景】`);
      parts.push(`原始需求: ${context.taskContext.originalPrompt}`);
      parts.push(`当前轮次: ${context.taskContext.currentRound}/${context.taskContext.maxRounds}`);
      if (context.taskContext.planSummary) {
        parts.push(`规划摘要: ${context.taskContext.planSummary}`);
      }
    }

    // 4. Add previous execution summaries (前置任务摘要 - 新增)
    if (context?.previousSummaries && context.previousSummaries.length > 0) {
      parts.push(`\n【前置任务执行摘要】`);
      context.previousSummaries.forEach((summary, i) => {
        parts.push(`\n--- 任务 ${i + 1} ---`);
        if (summary.filesChanged && summary.filesChanged.length > 0) {
          parts.push(`变更文件:`);
          summary.filesChanged.forEach(f => {
            parts.push(`  - ${f.path} (${f.action})${f.summary ? `: ${f.summary}` : ''}`);
          });
        }
        if (summary.outputs && summary.outputs.length > 0) {
          parts.push(`产出:`);
          summary.outputs.forEach(o => {
            parts.push(`  - ${o.description}${o.filePath ? ` (${o.filePath})` : ''}`);
          });
        }
        if (summary.issues && summary.issues.length > 0) {
          parts.push(`问题:`);
          summary.issues.forEach(issue => {
            parts.push(`  - [${issue.type}] ${issue.description}`);
          });
        }
      });
    }

    // 5. Add handoff information (handoff 信息 - 新增)
    if (context?.handoffFrom) {
      parts.push(`\n【交接信息】`);
      parts.push(`来源智能体: ${context.handoffFrom.agentName} (${context.handoffFrom.agentId})`);
      parts.push(`交接原因: ${context.handoffFrom.reason}`);
    }

    // 6. Add execution instructions
    parts.push(`\n【执行指令】`);
    parts.push(`请立即执行以下任务，使用可用的工具完成操作。`);
    parts.push(`执行完成后简要报告结果，不要只是回复消息。`);

    // 7. Add additional instructions if configured
    if (this.config.executionPrompt?.additionalInstructions) {
      parts.push(`\n【重要提示】\n${this.config.executionPrompt.additionalInstructions}`);
    }

    // 8. Add task description
    if (this.config.executionPrompt?.taskTemplate) {
      parts.push(`\n${this.config.executionPrompt.taskTemplate.replace('{task}', task)}`);
    } else {
      parts.push(`\n【当前任务】\n${task}`);
    }

    // 9. Add checklist if configured
    if (this.config.executionPrompt?.checklist && this.config.executionPrompt.checklist.length > 0) {
      parts.push('\n【注意事项】');
      this.config.executionPrompt.checklist.forEach((item, i) => {
        parts.push(`${i + 1}. ${item}`);
      });
    }

    // 10. Add boundaries reminder
    if (this.config.boundaries && this.config.boundaries.length > 0) {
      parts.push('\n【工作边界】');
      this.config.boundaries.forEach((boundary) => {
        parts.push(`- ${boundary}`);
      });
    }

    // 11. Add execution summary output requirement (执行摘要输出要求 - 新增)
    parts.push(this.getExecutionSummaryPrompt());

    return parts.join('\n');
  }

  /**
   * Get execution summary output prompt
   * 引导智能体输出结构化的执行摘要
   * 注意：摘要内容不会展示给用户，仅用于内部任务交接
   */
  protected getExecutionSummaryPrompt(): string {
    return `

【执行摘要输出要求】（必填！此部分不会展示给用户）
任务执行完成后，你必须在最后输出以下格式的 execution_summary 代码块：

\`\`\`execution_summary
{
  "status": "completed",
  "outputs": [
    {"type": "file", "description": "简要描述产出", "filePath": "文件路径"}
  ],
  "suggestions": []
}
\`\`\`

字段说明：
- status: 必填。completed=完成, partial=部分完成, failed=失败
- outputs: 必填。记录你的主要产出（创建的文件、执行的命令等）
- suggestions: 选填。如果需要其他智能体继续处理才填写
  - targetAgent: wukong(编码) | shaseng(检查) | bajie(文档) | tangseng(协调)
  - task: 建议的任务描述
  - reason: 为什么要交给这个智能体

示例1 - 任务完成，需要检查：
\`\`\`execution_summary
{
  "status": "completed",
  "outputs": [
    {"type": "file", "description": "创建了登录页面", "filePath": "src/pages/login.tsx"}
  ],
  "suggestions": [
    {"targetAgent": "shaseng", "task": "审查登录页面代码质量", "reason": "代码创建完成，需要质量检查"}
  ]
}
\`\`\`

示例2 - 任务完成，无需后续：
\`\`\`execution_summary
{
  "status": "completed",
  "outputs": [
    {"type": "file", "description": "修复了bug", "filePath": "src/utils/helper.ts"}
  ]
}
\`\`\`

请确保输出有效的JSON格式！`;
  }

  /**
   * Execute a task using CLI
   * 支持权限确认流程
   */
  async execute(
    context: AgentExecutionContext,
    callbacks?: AgentExecutionCallbacks,
  ): Promise<CliExecutionResult> {
    const { sessionId, workingDirectory, prompt, sessionWorkingDirectory } = context;
    const startTime = Date.now();

    // 简洁的日志输出
    this.logger.log(this.formatTaskLog(prompt));

    this.status = 'executing';

    // Only emit agent status event (not a message)
    if (this.wsService) {
      this.wsService.emitAgentStatus(this.config.id, 'executing', 'executing');
    }

    // Ensure CliExecutor is initialized
    this.ensureCliExecutor();

    // ===== 获取允许的工具列表 =====
    let allowedTools: string[] = [];
    if (this.permissionService && sessionId) {
      allowedTools = await this.permissionService.getAllowedTools(this.config.id, sessionId);
      this.logger.debug(`Allowed tools for ${this.config.id}: ${allowedTools.join(', ')}`);
    }

    // 设置允许的工具到 CliExecutor
    this.cliExecutor!.setAllowedTools(allowedTools);

    // Start activity-based timeout check
    this.cliExecutor!.startActivityCheck();

    // ===== 执行前：记录文件快照 =====
    const workDir = sessionWorkingDirectory || workingDirectory;
    this.captureFileSnapshot(workDir);

    try {
      const fullPrompt = this.buildPrompt(prompt, context);

      // Define event handler
      const handleEvent = (event: CliOutputEvent) => {
        this.handleCliEvent(sessionId, event, callbacks);
      };

      // Execute via CLI executor
      const result = await this.cliExecutor!.execute(fullPrompt, workDir, handleEvent);

      // ===== 处理权限拒绝 =====
      if (result.permissionDenials && result.permissionDenials.length > 0) {
        this.logger.log(`Permission denied for ${result.permissionDenials.length} tools`);

        // 处理权限请求
        const permissionGranted = await this.handlePermissionDenials(
          result.permissionDenials,
          sessionId,
        );

        if (permissionGranted) {
          // 用户授权了，重新执行
          this.logger.log('Permission granted, retrying execution...');
          this.cliExecutor!.stopActivityCheck();

          // 重新获取允许的工具列表（包含新授权的）
          allowedTools = await this.permissionService!.getAllowedTools(this.config.id, sessionId);
          this.cliExecutor!.setAllowedTools(allowedTools);
          this.cliExecutor!.startActivityCheck();

          // 重新执行
          const retryResult = await this.cliExecutor!.execute(fullPrompt, workDir, handleEvent);

          // 更新结果
          Object.assign(result, retryResult);
        } else {
          // 用户拒绝或没有响应
          this.logger.warn('Permission denied by user or no response');
          result.success = false;
          result.error = 'Permission denied by user';
        }
      }

      // ===== 执行后：检测文件变更并生成摘要 =====
      const filesChanged = this.detectFileChanges();
      const reportedSummary = SummaryParser.parse(result.output || '');

      // 合并生成最终摘要
      const executionSummary = this.buildExecutionSummary(
        result,
        filesChanged,
        reportedSummary,
        Date.now() - startTime,
      );

      // 将摘要附加到结果中
      result.executionSummary = executionSummary;

      this.status = 'idle';
      this.cliExecutor!.stopActivityCheck();

      if (result.success) {
        callbacks?.onComplete?.(sessionId, result);
      } else {
        callbacks?.onError?.(sessionId, result.error || 'Execution failed');
      }

      // Only emit agent status event (not a message)
      if (this.wsService) {
        this.wsService.emitAgentStatus(this.config.id, 'idle', 'idle');
      }

      return result;
    } catch (error) {
      this.status = 'idle';
      this.cliExecutor!.stopActivityCheck();

      const errorMessage = error instanceof Error ? error.message : String(error);
      callbacks?.onError?.(sessionId, errorMessage);
      if (this.wsService) {
        this.wsService.emitAgentStatus(this.config.id, 'idle', 'error');
      }

      throw error;
    }
  }

  /**
   * 处理权限拒绝
   * 向用户发送权限请求并等待响应
   * @returns true 如果用户授权了，false 如果拒绝
   */
  private async handlePermissionDenials(
    denials: PermissionDenial[],
    sessionId: string,
  ): Promise<boolean> {
    if (!this.wsService || !this.permissionService) {
      this.logger.warn('WebSocket or PermissionService not available, cannot request permission');
      return false;
    }

    // 处理第一个权限拒绝（通常只有一个）
    const denial = denials[0];

    // 创建权限请求
    const request = this.permissionService.createRequestFromDenial(
      denial,
      sessionId,
      this.config.id,
    );

    // 构建权限请求消息
    const permissionMessage: PermissionRequestMessage = {
      type: 'permission_request',
      id: request.id,
      sessionId,
      agentId: this.config.id,
      agentName: this.config.name,
      toolName: request.toolName,
      toolCategory: request.toolCategory,
      input: request.input,
      risk: request.risk,
      timestamp: request.timestamp,
      // 构建人类可读的描述
      description: this.buildPermissionDescription(request.toolName, request.input),
    };

    this.logger.log(`Sending permission request: ${request.toolName}`);

    try {
      // 发送权限请求到前端并等待响应
      const response = await this.wsService.sendPermissionRequest(sessionId, permissionMessage);

      if (response.action === 'allow') {
        // 保存决定
        await this.permissionService.saveDecision(
          sessionId,
          response.remember ? request.toolName : request.toolName,
          'allow',
        );

        // 如果用户选择"记住此决定"，保存到会话
        if (response.remember) {
          this.logger.log(`Remembering permission decision for ${request.toolName}`);
        }

        return true;
      } else {
        // 用户拒绝
        return false;
      }
    } catch (error) {
      this.logger.error(`Error handling permission request: ${error}`);
      return false;
    }
  }

  /**
   * 构建权限请求的人类可读描述
   */
  private buildPermissionDescription(
    toolName: string,
    input: Record<string, unknown>,
  ): string {
    switch (toolName) {
      case 'WebFetch':
      case 'WebSearch':
        return `访问网络: ${(input.url as string) || (input.query as string) || '未知地址'}`;
      case 'Bash':
        return `执行命令: ${(input.command as string) || '未知命令'}`;
      case 'Read':
        return `读取文件: ${(input.file_path as string) || '未知文件'}`;
      case 'Write':
        return `写入文件: ${(input.file_path as string) || '未知文件'}`;
      case 'Edit':
        return `编辑文件: ${(input.file_path as string) || '未知文件'}`;
      case 'Agent':
        return `调用子智能体: ${(input.agent_id as string) || '未知智能体'}`;
      default:
        return `使用工具: ${toolName}`;
    }
  }

  // ===== 文件变更追踪方法 =====

  /**
   * 执行前捕获文件快照
   */
  private captureFileSnapshot(workingDirectory: string): void {
    this.currentWorkingDir = workingDirectory;
    this.fileSnapshot.clear();

    if (!fs.existsSync(workingDirectory)) {
      this.logger.warn(`Working directory does not exist: ${workingDirectory}`);
      return;
    }

    this.scanDirectory(workingDirectory);
  }

  /**
   * 递归扫描目录，记录文件哈希
   */
  private scanDirectory(dir: string, relativePath: string = ''): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        // 跳过排除的模式
        if (ExecutableAgentBase.EXCLUDED_PATTERNS.some(p => entry.name.includes(p))) {
          continue;
        }

        const fullRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          this.scanDirectory(fullPath, fullRelativePath);
        } else if (entry.isFile()) {
          try {
            const hash = this.getFileHash(fullPath);
            this.fileSnapshot.set(fullRelativePath, hash);
          } catch (e) {
            // 忽略无法读取的文件
          }
        }
      }
    } catch (e) {
      this.logger.warn(`Error scanning directory ${dir}: ${e}`);
    }
  }

  /**
   * 计算文件 MD5 哈希
   */
  private getFileHash(filePath: string): string {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * 执行后检测文件变更
   */
  private detectFileChanges(): FileChange[] {
    const changes: FileChange[] = [];
    const newSnapshot = new Map<string, string>();

    if (!fs.existsSync(this.currentWorkingDir)) {
      return changes;
    }

    // 重新扫描目录
    const scanNew = (dir: string, relativePath: string = '') => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (ExecutableAgentBase.EXCLUDED_PATTERNS.some(p => entry.name.includes(p))) {
            continue;
          }

          const fullRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            scanNew(fullPath, fullRelativePath);
          } else if (entry.isFile()) {
            try {
              const hash = this.getFileHash(fullPath);
              newSnapshot.set(fullRelativePath, hash);

              const oldHash = this.fileSnapshot.get(fullRelativePath);

              if (!oldHash) {
                // 新文件
                changes.push({
                  path: fullRelativePath,
                  action: 'created',
                });
              } else if (oldHash !== hash) {
                // 修改的文件
                changes.push({
                  path: fullRelativePath,
                  action: 'modified',
                });
              }
            } catch (e) {
              // 忽略无法读取的文件
            }
          }
        }
      } catch (e) {
        this.logger.warn(`Error scanning directory ${dir}: ${e}`);
      }
    };

    scanNew(this.currentWorkingDir);

    // 检测删除的文件
    for (const [oldPath] of this.fileSnapshot) {
      if (!newSnapshot.has(oldPath)) {
        changes.push({
          path: oldPath,
          action: 'deleted',
        });
      }
    }

    if (changes.length > 0) {
      this.logger.log(`Detected ${changes.length} file changes`);
    }

    return changes;
  }

  /**
   * 构建执行摘要
   */
  private buildExecutionSummary(
    result: CliExecutionResult,
    filesChanged: FileChange[],
    reportedSummary: ExecutionSummary | null,
    durationMs: number,
  ): ExecutionSummary {
    const builder = new ExecutionSummaryBuilder();

    // 设置状态
    const status = reportedSummary?.status ?? (result.success ? 'completed' : 'failed');
    builder.setStatus(status);

    // 添加文件变更（自动收集）
    for (const file of filesChanged) {
      builder.addFileChange(file.path, file.action, file.summary);
    }

    // 添加智能体报告的产出
    if (reportedSummary?.outputs) {
      for (const output of reportedSummary.outputs) {
        builder.addOutput(output.type, output.description, output.value, output.filePath);
      }
    }

    // 添加建议（用于 handoff）
    if (reportedSummary?.suggestions) {
      for (const suggestion of reportedSummary.suggestions) {
        builder.addSuggestion(
          suggestion.targetAgent,
          suggestion.task,
          suggestion.reason,
          suggestion.priority,
        );
      }
    }

    // 添加问题
    if (reportedSummary?.issues) {
      for (const issue of reportedSummary.issues) {
        builder.addIssue(issue.type, issue.description, issue.resolved);
      }
    }

    // 设置耗时
    builder.setDuration(Math.round(durationMs / 1000));

    return builder.build();
  }

  // Track streaming content to save final message
  private streamingContent: Map<string, string> = new Map();
  // Track which messages are being streamed (to ignore duplicate assistant messages)
  private activeStreamMessages: Set<string> = new Set();
  // Track which tools have been broadcasted (to avoid duplicates from stream_event and assistant messages)
  private broadcastedTools: Set<string> = new Set();
  // Track the last broadcasted position for each stream (to handle hiding)
  private lastBroadcastedIndex: Map<string, number> = new Map();
  // Track if we're inside a hidden block
  private hiddenBlockState: Map<string, boolean> = new Map();

  /**
   * Handle CLI output event
   */
  protected handleCliEvent(
    sessionId: string,
    event: CliOutputEvent,
    callbacks?: AgentExecutionCallbacks,
  ): void {
    switch (event.type) {
      case 'init':
        callbacks?.onInit?.(sessionId);
        break;

      case 'text':
        callbacks?.onText?.(sessionId, event.content || '');
        if (event.isPartial) {
          // Partial message from stream_event - this is incremental content
          const streamKey = event.messageId || this.config.id;
          const existing = this.streamingContent.get(streamKey) || '';
          const newContent = event.content || '';
          const fullContent = existing + newContent;
          this.streamingContent.set(streamKey, fullContent);
          // Mark this message as actively streaming
          this.activeStreamMessages.add(streamKey);

          // Check if we should broadcast this chunk
          // We track if we're inside a code block that should be hidden
          const shouldHide = this.shouldHideContent(streamKey, fullContent);

          if (!shouldHide) {
            // Broadcast the new chunk
            // Note: we broadcast the raw chunk, filtering happens at save time
            this.broadcastStreamingText(sessionId, newContent, event.messageId, false);
          }
        } else {
          // Non-partial text - this could be a complete assistant message
          const streamKey = event.messageId || this.config.id;

          // Check if we're already streaming this message (from stream_event)
          // If so, ignore the assistant message to avoid duplicates
          if (this.activeStreamMessages.has(streamKey)) {
            // Already streaming this message via stream_event, skip the duplicate
          } else {
            // Not streaming - this is a standalone non-streaming message
            const content = event.content || '';
            this.streamingContent.set(streamKey, content);
            // Filter content before broadcasting
            const filteredContent = this.removeSummaryFromContent(content);
            if (filteredContent) {
              this.broadcastStreamingText(sessionId, filteredContent, event.messageId, false);
            }
          }
        }
        break;

      case 'complete':
        // Message complete - save accumulated content to database
        // Note: saveStreamingMessage already sends completion signal to frontend
        this.saveStreamingMessage(sessionId, event.messageId);
        // Clear the active streaming marker
        const streamKey = event.messageId || this.config.id;
        this.activeStreamMessages.delete(streamKey);
        // Clear broadcasted tools tracking for this message
        this.broadcastedTools.clear();
        // Clear tracking state
        this.lastBroadcastedIndex.delete(streamKey);
        this.hiddenBlockState.delete(streamKey);
        break;

      case 'tool_use':
        callbacks?.onToolUse?.(sessionId, event.toolName || '', event.toolInput || {});
        // Only broadcast when we have complete tool info (not just partial streaming)
        if (event.toolName && Object.keys(event.toolInput || {}).length > 0) {
          // Check if we already broadcasted this tool (avoid duplicates from stream_event + assistant)
          const toolKey = `${event.toolName}`;
          if (!this.broadcastedTools.has(toolKey)) {
            this.broadcastedTools.add(toolKey);
            this.broadcastToolUse(sessionId, event.toolName, event.toolInput || {});
          }
        }
        break;

      case 'tool_result':
        // Tool execution complete - mark the tool as complete
        this.broadcastToolResult(sessionId, event.toolResult);
        break;

      case 'error':
        this.broadcastError(sessionId, event.error || 'Unknown error');
        break;

      case 'thinking':
        // Broadcast thinking status to frontend for UI feedback
        // isPartial=true means thinking in progress (show indicator)
        // isPartial=false means thinking complete (hide indicator)
        this.broadcastThinkingStatus(sessionId, event.isPartial === false);
        break;
    }
  }

  /**
   * Save streaming message to database when complete
   * Uses stream- prefix ID to match frontend streaming message
   * Sends cleaned content to frontend to replace accumulated streaming content
   */
  private saveStreamingMessage(sessionId: string, messageId?: string): void {
    const streamKey = messageId || this.config.id;
    const rawContent = this.streamingContent.get(streamKey);
    const streamId = `stream-${messageId || this.config.id}`;

    if (this.wsService) {
      // Remove execution summary from content before saving
      const content = rawContent ? this.removeSummaryFromContent(rawContent) : '';

      // Save content to database if we have it
      if (content) {
        this.saveMessageToDatabase(sessionId, streamId, content);
      }

      // Send the cleaned final content to frontend
      // Frontend should replace the streaming message with this final content
      this.wsService.emitToSession(sessionId, 'message', {
        id: streamId,
        sessionId,
        sender: 'agent',
        senderId: this.config.id,
        senderName: this.config.name,
        type: 'text',
        content: content,  // Send cleaned content (not empty)
        createdAt: new Date(),
        metadata: { isComplete: true, isStreaming: false, isFinal: true },
      });

      // Clear accumulated content
      this.streamingContent.delete(streamKey);
      this.lastBroadcastedIndex.delete(streamKey);
    }
  }

  /**
   * Determine if we should hide content from the current streaming position
   * This checks if the content contains hidden blocks (execution_summary, json, etc.)
   * and whether we're currently inside such a block
   */
  private shouldHideContent(_streamKey: string, fullContent: string): boolean {
    // Patterns for blocks we want to hide
    const hiddenBlockPatterns = [
      /```execution_summary\b/g,
      /```json\b/g,
      /```\{/g,
    ];

    // Find the start of any hidden block
    let hiddenBlockStart = -1;
    let hiddenBlockEnd = -1;

    for (const pattern of hiddenBlockPatterns) {
      const match = fullContent.match(pattern);
      if (match) {
        const startIndex = fullContent.search(pattern);
        if (startIndex !== -1) {
          // Find the closing ```
          const afterStart = fullContent.substring(startIndex);
          const closeMatch = afterStart.match(/```[\s\S]*?```/);
          if (closeMatch) {
            // Block is complete, check if we should hide based on position
            hiddenBlockStart = startIndex;
            hiddenBlockEnd = startIndex + closeMatch[0].length;
          } else {
            // Block is incomplete - we're inside it
            hiddenBlockStart = startIndex;
            hiddenBlockEnd = -1; // No end yet
          }
          break;
        }
      }
    }

    // If we found a hidden block
    if (hiddenBlockStart !== -1) {
      if (hiddenBlockEnd === -1) {
        // Block is incomplete, we're inside it
        return true;
      } else {
        // Block is complete, check if cursor is inside it
        // Since we're checking full content, if block exists, we might be past it
        // For streaming, we need to check if the last part of content is inside a block
        // Simplified: if content ends with incomplete pattern, hide
        const lastPart = fullContent.substring(Math.max(0, fullContent.length - 100));
        for (const pattern of hiddenBlockPatterns) {
          if (pattern.test(lastPart)) {
            // Check if it's closed
            const closeIndex = lastPart.lastIndexOf('```');
            const openIndex = lastPart.search(pattern);
            if (closeIndex === -1 || closeIndex < openIndex + 3) {
              return true;
            }
          }
        }
      }
    }

    // Check for orphan ``` at end (might be start of hidden block)
    const trimmedEnd = fullContent.trimEnd();
    if (trimmedEnd.endsWith('```')) {
      // Check if this ``` is closing something or starting something
      const tripleBacktickCount = (fullContent.match(/```/g) || []).length;
      if (tripleBacktickCount % 2 !== 0) {
        // Odd number of ```, last one is opening a block
        return true;
      }
    }

    return false;
  }

  /**
   * Remove execution summary block from content
   * Used before saving to database
   */
  private removeSummaryFromContent(content: string): string {
    let cleaned = content;

    // 1. Remove execution_summary blocks (complete)
    cleaned = cleaned.replace(/```execution_summary[\s\S]*?```/g, '');

    // 2. Remove json blocks (LLM might output JSON for summary)
    cleaned = cleaned.replace(/```json[\s\S]*?```/g, '');

    // 3. Remove code blocks starting with { (JSON residual)
    cleaned = cleaned.replace(/```\{[\s\S]*?```/g, '');

    // 4. Remove empty code blocks (``` followed only by whitespace/newlines then ```)
    cleaned = cleaned.replace(/```\s*\n?\s*```/g, '');

    // 5. Remove orphan backticks (single ``` on its own line or at end)
    cleaned = cleaned.replace(/^```\s*$/gm, '');
    cleaned = cleaned.replace(/```\s*$/g, '');

    // 6. Clean up multiple newlines
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

    return cleaned;
  }

  /**
   * Save message to database only (not broadcasted to frontend)
   */
  private saveMessageToDatabase(sessionId: string, messageId: string, content: string): void {
    if (this.wsService) {
      // Use broadcastMessage with a flag to skip Redis save
      // Or directly call the session service to save
      this.wsService.saveMessageToDatabase(sessionId, {
        id: messageId,
        sessionId,
        sender: 'agent',
        senderId: this.config.id,
        senderName: this.config.name,
        type: 'text',
        content,
      });
    }
  }

  /**
   * Broadcast streaming text with proper message ID tracking
   * Streaming chunks are NOT saved to database - only the final complete message
   */
  protected broadcastStreamingText(
    sessionId: string,
    content: string,
    messageId?: string,
    isComplete: boolean = false,
  ): void {
    if (this.wsService) {
      // Use CLI message ID if available, otherwise use agent-based streaming ID
      const streamId = messageId
        ? `stream-${messageId}`
        : `stream-${this.config.id}`;

      // Note: Removed verbose debug logging for streaming chunks

      // For streaming, we use emitToSession directly to avoid saving to database
      // The final complete message will be saved separately
      this.wsService.emitToSession(sessionId, 'message', {
        id: streamId,
        sessionId,
        sender: 'agent',
        senderId: this.config.id,
        senderName: this.config.name,
        type: isComplete ? 'text' : 'thinking',
        content,
        createdAt: new Date(),
        metadata: { isComplete, isStreaming: !isComplete },
      } as any);
    }
  }

  /**
   * Cancel current execution
   */
  cancel(): void {
    if (this.status === 'executing') {
      this.logger.log('Cancelling execution');
      this.ensureCliExecutor();
      this.cliExecutor!.cancel();
      this.status = 'idle';
    }
  }

  /**
   * Check if agent is available
   */
  isAvailable(): boolean {
    this.ensureCliExecutor();
    return this.status === 'idle' && !this.cliExecutor!.isExecuting();
  }

  /**
   * Broadcast agent status (only emit agent_status event, no message)
   */
  protected broadcastAgentStatus(_sessionId: string, status: string, action?: string): void {
    if (this.wsService) {
      this.wsService.emitAgentStatus(this.config.id, status, action);
    }
  }

  // Track current tool message ID for updating status
  // Use a stack to handle nested/concurrent tool calls
  private toolStack: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

  /**
   * Broadcast tool use - mark as in progress
   * Tool use messages are persisted to database
   */
  protected broadcastToolUse(sessionId: string, toolName: string, input: Record<string, unknown>): void {
    // Generate unique tool ID using uuid to avoid duplicates
    const toolId = `tool-${uuidv4()}`;

    // Push to stack for later reference
    this.toolStack.push({ id: toolId, name: toolName, input });

    if (this.wsService) {
      this.wsService.broadcastMessage(sessionId, {
        id: toolId,
        sessionId,
        sender: 'agent',
        senderId: this.config.id,
        senderName: this.config.name,
        type: 'tool_use',
        content: `使用工具: ${toolName}`,
        metadata: { toolName, input, isComplete: false },
        createdAt: new Date(),
      });
    }
  }

  /**
   * Broadcast tool result - mark tool as complete
   * Updates the existing tool_use message (uses the most recent tool from stack)
   * Uses emitToSession to update frontend, and updates database metadata
   */
  protected broadcastToolResult(sessionId: string, result: unknown): void {
    // Pop the most recent tool from stack
    const tool = this.toolStack.pop();

    if (this.wsService && tool) {
      // Update frontend via WebSocket
      this.wsService.emitToSession(sessionId, 'message', {
        id: tool.id,
        sessionId,
        sender: 'agent',
        senderId: this.config.id,
        senderName: this.config.name,
        type: 'tool_use',
        content: `工具执行完成`,
        metadata: {
          toolName: tool.name,
          input: tool.input,
          isComplete: true,
          result
        },
        createdAt: new Date(),
      });

      // Update the database record's metadata
      this.wsService.updateMessageMetadata(tool.id, {
        toolName: tool.name,
        input: tool.input,
        isComplete: true,
        result
      }).catch((err: Error) => {
        this.logger.error(`Failed to update tool message in database: ${err}`);
      });
    }
  }

  /**
   * Format task log for cleaner output
   * Extracts task type and key info from prompt
   */
  private formatTaskLog(prompt: string): string {
    // 检测任务类型
    if (prompt.includes('【闲聊任务】')) {
      // 提取用户消息
      const userMsgMatch = prompt.match(/【用户消息】\n(.+?)(?:\n【|$)/s);
      const userMsg = userMsgMatch ? userMsgMatch[1].trim() : '闲聊';
      const truncatedMsg = userMsg.length > 30 ? userMsg.substring(0, 30) + '...' : userMsg;
      return `闲聊回复: "${truncatedMsg}"`;
    }

    if (prompt.includes('【当前任务】') || prompt.includes('【执行指令】')) {
      // 提取任务描述
      const taskMatch = prompt.match(/【当前任务】\n(.+?)(?:\n【|$)/s) ||
                        prompt.match(/请执行以下任务[：:]\s*(.+?)(?:\n\n|$)/s);
      const task = taskMatch ? taskMatch[1].trim() : '';
      const truncatedTask = task.length > 40 ? task.substring(0, 40) + '...' : task;
      return `执行任务: "${truncatedTask}"`;
    }

    // 默认情况：显示提示词前30个字符
    const truncated = prompt.substring(0, 30).replace(/\n/g, ' ');
    return `执行: "${truncated}..."`;
  }

  /**
   * Broadcast thinking status to frontend
   * Shows "正在思考..." loading indicator
   */
  protected broadcastThinkingStatus(sessionId: string, isComplete: boolean): void {
    if (this.wsService) {
      this.wsService.emitToSession(sessionId, 'message', {
        id: `thinking-${this.config.id}`,
        sessionId,
        sender: 'agent',
        senderId: this.config.id,
        senderName: this.config.name,
        type: 'thinking',
        content: '',
        createdAt: new Date(),
        metadata: { isThinking: true, isComplete },
      });
    }
  }

  /**
   * Broadcast error
   */
  protected broadcastError(sessionId: string, error: string): void {
    if (this.wsService) {
      this.wsService.emitError('AGENT_ERROR', error, sessionId);
    }
  }
}