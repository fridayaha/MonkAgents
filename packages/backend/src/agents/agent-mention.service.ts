import { Injectable } from '@nestjs/common';

/**
 * 解析后的智能体引用
 */
export interface AgentMention {
  agentId: string;
  agentName: string;
  position: { start: number; end: number };
}

/**
 * 解析后的用户消息
 */
export interface ParsedMessage {
  originalContent: string;
  cleanedContent: string;      // 移除 @mentions 后的内容
  mentions: AgentMention[];
  hasMentions: boolean;
  primaryAgent?: string;        // 主要的智能体 ID
}

/**
 * 智能体唤醒服务
 * 负责：
 * 1. 解析用户消息中的 @mentions
 * 2. 确定目标智能体
 * 3. 支持智能体协作指令
 */
@Injectable()
export class AgentMentionService {

  // 智能体别名映射
  private readonly agentAliases: Map<string, string> = new Map([
    // 孙悟空
    ['wukong', 'wukong'],
    ['孙悟空', 'wukong'],
    ['悟空', 'wukong'],
    ['猴子', 'wukong'],
    ['大圣', 'wukong'],

    // 猪八戒
    ['bajie', 'bajie'],
    ['猪八戒', 'bajie'],
    ['八戒', 'bajie'],
    ['老猪', 'bajie'],

    // 沙僧
    ['shaseng', 'shaseng'],
    ['沙僧', 'shaseng'],
    ['沙师弟', 'shaseng'],
    ['老沙', 'shaseng'],

    // 如来佛祖
    ['rulai', 'rulai'],
    ['如来佛祖', 'rulai'],
    ['如来', 'rulai'],
    ['佛祖', 'rulai'],

    // 唐僧
    ['tangseng', 'tangseng'],
    ['唐僧', 'tangseng'],
    ['师父', 'tangseng'],
    ['师傅', 'tangseng'],
  ]);

  /**
   * 解析消息中的 @mentions
   */
  parseMessage(content: string): ParsedMessage {
    const mentions: AgentMention[] = [];
    const mentionRegex = /@(\w+|[\u4e00-\u9fa5]+)/g;
    let match: RegExpExecArray | null;
    let cleanedContent = content;

    while ((match = mentionRegex.exec(content)) !== null) {
      const mentionText = match[1];
      const agentId = this.resolveAgentId(mentionText);

      if (agentId) {
        mentions.push({
          agentId,
          agentName: this.getAgentName(agentId),
          position: {
            start: match.index,
            end: match.index + match[0].length,
          },
        });

        // 从清理后的内容中移除 @mention
        cleanedContent = cleanedContent.replace(match[0], '').trim();
      }
    }

    // 清理多余的空格
    cleanedContent = cleanedContent.replace(/\s+/g, ' ').trim();

    return {
      originalContent: content,
      cleanedContent,
      mentions,
      hasMentions: mentions.length > 0,
      primaryAgent: mentions.length > 0 ? mentions[0].agentId : undefined,
    };
  }

  /**
   * 解析智能体别名到 ID
   */
  resolveAgentId(alias: string): string | undefined {
    return this.agentAliases.get(alias.toLowerCase());
  }

  /**
   * 获取智能体显示名称
   */
  getAgentName(agentId: string): string {
    const names: Record<string, string> = {
      wukong: '孙悟空',
      bajie: '猪八戒',
      shaseng: '沙僧',
      rulai: '如来佛祖',
      tangseng: '唐僧',
    };
    return names[agentId] || agentId;
  }

  /**
   * 验证智能体 ID 是否有效
   */
  isValidAgentId(agentId: string): boolean {
    const validIds = ['wukong', 'bajie', 'shaseng', 'rulai', 'tangseng'];
    return validIds.includes(agentId);
  }

  /**
   * 获取所有支持的别名
   */
  getAllAliases(): string[] {
    return Array.from(this.agentAliases.keys());
  }

  /**
   * 构建协作指令
   * 当消息中提及多个智能体时，生成协作指令
   */
  buildCollaborationInstruction(
    mentions: AgentMention[],
    task: string,
  ): string {
    if (mentions.length === 0) {
      return task;
    }

    if (mentions.length === 1) {
      return `【${mentions[0].agentName}请处理】\n${task}`;
    }

    // 多智能体协作
    const agentNames = mentions.map(m => m.agentName).join('、');
    return `【协作任务 - 参与者：${agentNames}】\n${task}`;
  }

  /**
   * 从消息中提取任务优先级
   */
  extractPriority(content: string): 'high' | 'medium' | 'low' {
    const highKeywords = ['紧急', 'urgent', '立即', '马上', 'critical', '重要'];
    const lowKeywords = ['稍后', 'later', '有空', '不急', 'low'];

    const contentLower = content.toLowerCase();

    if (highKeywords.some(k => contentLower.includes(k))) {
      return 'high';
    }

    if (lowKeywords.some(k => contentLower.includes(k))) {
      return 'low';
    }

    return 'medium';
  }

  /**
   * 生成智能体提示语
   */
  generateAgentPrompt(
    agentId: string,
    task: string,
    context?: {
      fromAgent?: string;
      sessionId?: string;
      workingDirectory?: string;
    },
  ): string {
    const agentName = this.getAgentName(agentId);

    let prompt = `${agentName}，请执行以下任务：\n\n${task}`;

    if (context?.fromAgent) {
      const fromName = this.getAgentName(context.fromAgent);
      prompt = `${fromName}请求你协助：\n\n${task}`;
    }

    if (context?.workingDirectory) {
      prompt += `\n\n工作目录：${context.workingDirectory}`;
    }

    return prompt;
  }
}