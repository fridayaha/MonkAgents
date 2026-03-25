import {
  ExecutionSummary,
  ExecutionStatus,
  FileChange,
  OutputItem,
  Suggestion,
  Issue,
  AgentId,
} from '@monkagents/shared';

/**
 * 执行摘要解析器
 * 从智能体 CLI 输出中解析结构化的执行摘要
 */
export class SummaryParser {
  /**
   * 从 CLI 输出中解析执行摘要
   */
  static parse(output: string): ExecutionSummary | null {
    if (!output) {
      return null;
    }

    // 从 JSON 格式的 CLI 输出中提取文本内容
    const extractedText = this.extractTextFromCliOutput(output);

    // 方法1: 查找 ```execution_summary 代码块
    const codeBlockMatch = extractedText.match(/```execution_summary\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        const json = JSON.parse(codeBlockMatch[1].trim());
        return this.validateAndNormalize(json);
      } catch (e) {
        // JSON 解析失败，继续尝试其他方法
      }
    }

    // 方法2: 查找 ```json 代码块中包含 status 字段的对象
    const jsonBlockMatch = extractedText.match(/```json\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      try {
        const json = JSON.parse(jsonBlockMatch[1].trim());
        if (json.status || json.filesChanged || json.outputs || json.suggestions) {
          return this.validateAndNormalize(json);
        }
      } catch (e) {
        // 继续尝试其他方法
      }
    }

    // 方法3: 查找 JSON 对象（包含 status 或 suggestions 字段）
    const jsonMatch = extractedText.match(/\{[\s\S]*"(?:status|suggestions)"[\s\S]*\}/);
    if (jsonMatch) {
      const fullJson = this.extractCompleteJson(extractedText, jsonMatch.index!);
      if (fullJson) {
        try {
          const json = JSON.parse(fullJson);
          if (json.status || json.suggestions || json.outputs) {
            return this.validateAndNormalize(json);
          }
        } catch (e) {
          // 解析失败，返回 null
        }
      }
    }

    // 没有找到摘要，这是正常情况
    return null;
  }

  /**
   * 从 CLI 输出中提取文本内容
   * 处理 JSON 格式的输出，提取 result[0].text 或 assistant.message.content
   */
  private static extractTextFromCliOutput(output: string): string {
    // 尝试解析为 NDJSON 格式
    const lines = output.split('\n').filter(line => line.trim());

    // 收集所有文本内容
    let allText = '';

    for (const line of lines) {
      try {
        const json = JSON.parse(line);

        // 处理 result 类型消息
        if (json.type === 'result' && Array.isArray(json.result)) {
          for (const item of json.result) {
            if (item.type === 'text' && item.text) {
              allText += item.text + '\n';
            }
          }
        }

        // 处理 assistant 类型消息
        if (json.type === 'assistant' && json.message?.content) {
          for (const block of json.message.content) {
            if (block.type === 'text' && block.text) {
              allText += block.text + '\n';
            }
          }
        }
      } catch {
        // 不是 JSON，可能是纯文本，直接追加
        allText += line + '\n';
      }
    }

    // 如果没有提取到文本，返回原始输出
    return allText || output;
  }

  /**
   * 提取完整的 JSON 对象
   */
  private static extractCompleteJson(text: string, startIndex: number): string | null {
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = startIndex; i < text.length; i++) {
      const char = text[i];

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
        if (char === '{') depth++;
        if (char === '}') {
          depth--;
          if (depth === 0) {
            return text.substring(startIndex, i + 1);
          }
        }
      }
    }

    return null;
  }

  /**
   * 验证并规范化摘要
   */
  private static validateAndNormalize(data: any): ExecutionSummary {
    const status = this.normalizeStatus(data.status);
    const filesChanged = this.normalizeFilesChanged(data.filesChanged);
    const outputs = this.normalizeOutputs(data.outputs);
    const suggestions = this.normalizeSuggestions(data.suggestions);
    const issues = this.normalizeIssues(data.issues);

    const summary: ExecutionSummary = {
      status,
      filesChanged,
      outputs,
      timestamp: new Date(),
    };

    if (suggestions.length > 0) {
      summary.suggestions = suggestions;
    }

    if (issues.length > 0) {
      summary.issues = issues;
    }

    if (typeof data.duration === 'number') {
      summary.duration = data.duration;
    }

    return summary;
  }

  /**
   * 规范化状态
   */
  private static normalizeStatus(status: any): ExecutionStatus {
    if (['completed', 'partial', 'failed'].includes(status)) {
      return status;
    }
    return 'completed';
  }

  /**
   * 规范化文件变更列表
   */
  private static normalizeFilesChanged(files: any): FileChange[] {
    if (!Array.isArray(files)) {
      return [];
    }

    return files
      .filter(f => f && typeof f.path === 'string')
      .map(f => ({
        path: f.path,
        action: ['created', 'modified', 'deleted'].includes(f.action) ? f.action : 'modified',
        summary: typeof f.summary === 'string' ? f.summary : undefined,
        linesAdded: typeof f.linesAdded === 'number' ? f.linesAdded : undefined,
        linesDeleted: typeof f.linesDeleted === 'number' ? f.linesDeleted : undefined,
      }));
  }

  /**
   * 规范化输出列表
   */
  private static normalizeOutputs(outputs: any): OutputItem[] {
    if (!Array.isArray(outputs)) {
      return [];
    }

    return outputs
      .filter(o => o && typeof o.description === 'string')
      .map(o => ({
        type: ['file', 'command', 'analysis', 'artifact'].includes(o.type) ? o.type : 'artifact',
        description: o.description,
        value: typeof o.value === 'string' ? o.value : undefined,
        filePath: typeof o.filePath === 'string' ? o.filePath : undefined,
      }));
  }

  /**
   * 规范化建议列表
   */
  private static normalizeSuggestions(suggestions: any): Suggestion[] {
    if (!Array.isArray(suggestions)) {
      return [];
    }

    const validAgents: AgentId[] = ['tangseng', 'wukong', 'shaseng', 'bajie', 'rulai'];

    return suggestions
      .filter(s => s && typeof s.task === 'string')
      .map(s => ({
        targetAgent: validAgents.includes(s.targetAgent) ? s.targetAgent : 'wukong',
        task: s.task,
        reason: typeof s.reason === 'string' ? s.reason : '',
        priority: ['high', 'medium', 'low'].includes(s.priority) ? s.priority : 'medium',
      }));
  }

  /**
   * 规范化问题列表
   */
  private static normalizeIssues(issues: any): Issue[] {
    if (!Array.isArray(issues)) {
      return [];
    }

    return issues
      .filter(i => i && typeof i.description === 'string')
      .map(i => ({
        type: ['error', 'warning', 'question', 'blocker'].includes(i.type) ? i.type : 'warning',
        description: i.description,
        resolved: typeof i.resolved === 'boolean' ? i.resolved : undefined,
      }));
  }

  /**
   * 生成默认摘要（当解析失败时）
   */
  static generateDefault(
    status: ExecutionStatus = 'completed',
    filesChanged: FileChange[] = [],
  ): ExecutionSummary {
    return {
      status,
      filesChanged,
      outputs: [],
      timestamp: new Date(),
    };
  }

  /**
   * 从多个摘要中提取所有变更文件
   */
  static extractAllChangedFiles(summaries: ExecutionSummary[]): FileChange[] {
    const fileMap = new Map<string, FileChange>();

    for (const summary of summaries) {
      for (const file of summary.filesChanged) {
        // 如果文件已存在，保留最新的变更记录
        fileMap.set(file.path, file);
      }
    }

    return Array.from(fileMap.values());
  }

  /**
   * 检查是否包含 handoff 建议
   */
  static hasHandoffSuggestion(summary: ExecutionSummary | null): boolean {
    return summary?.suggestions?.length ? summary.suggestions.length > 0 : false;
  }

  /**
   * 获取第一个 handoff 建议
   */
  static getFirstHandoffSuggestion(summary: ExecutionSummary | null): Suggestion | null {
    return summary?.suggestions?.[0] || null;
  }
}