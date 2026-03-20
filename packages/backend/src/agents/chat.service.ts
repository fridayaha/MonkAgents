import { Injectable, Logger } from '@nestjs/common';
import { AgentConfig } from '@monkagents/shared';
import { AgentsService } from './agents.service';
import { WebSocketService } from '../websocket/websocket.service';

/**
 * 群聊响应结果
 */
export interface ChatResponse {
  agentId: string;
  agentName: string;
  content: string;
  emoji?: string;
}

/**
 * 任务分配结果
 */
export interface TaskAssignment {
  agentId: string;
  agentName: string;
  task: string;
  priority: number;
}

/**
 * 群聊服务
 * 处理群聊模式下的多智能体响应
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  // 智能体角色特点（用于生成回复）
  private readonly agentPersonality: Record<string, {
    greetingStyle: string;
    responsePatterns: string[];
    interests: string[];
  }> = {
    wukong: {
      greetingStyle: '桀骜不驯、机智勇敢、语速快',
      responsePatterns: [
        '俺老孙',
        '嘿嘿',
        '呔',
        '看俺老孙来解决',
        '呆子',
      ],
      interests: ['编码', '调试', '技术挑战', '新功能'],
    },
    bajie: {
      greetingStyle: '幽默懒散、爱抱怨、油滑',
      responsePatterns: [
        '老猪我',
        '嘿嘿嘿',
        '师父，大师兄又欺负我',
        '可累死老猪了',
        '俺老猪先吃点东西',
      ],
      interests: ['文档', '格式整理', '简单任务', '早点下班'],
    },
    shaseng: {
      greetingStyle: '忠厚老实、稳重踏实、简洁谦卑',
      responsePatterns: [
        '师父说得对',
        '大师兄说得对',
        '二师兄说得对',
        '俺老沙',
        '师父放心',
      ],
      interests: ['质量检查', '代码审查', '测试验证', '规范性'],
    },
    tangseng: {
      greetingStyle: '慢条斯理、慈悲为怀、教诲口吻',
      responsePatterns: [
        '阿弥陀佛',
        '贫僧以为',
        '善哉善哉',
        '徒儿们',
        '此事需从长计议',
      ],
      interests: ['任务规划', '团队协调', '决策', '质量把控'],
    },
    rulai: {
      greetingStyle: '庄严肃穆、字字珠玑、深不可测',
      responsePatterns: [
        '善哉',
        '汝等',
        '此乃',
        '因果循环',
        '不可说',
      ],
      interests: ['架构设计', '战略指导', '疑难问题', '最佳实践'],
    },
  };

  constructor(
    private readonly agentsService: AgentsService,
  ) {}

  /**
   * 判断是否为群聊消息
   * 群聊消息特征：
   * 1. 没有@mention
   * 2. 不是明确的任务请求
   * 3. 看起来像日常问候或闲聊
   */
  isChatMessage(content: string, parsedMessage: { hasMentions: boolean }): boolean {
    // 如果有@mention，不是群聊
    if (parsedMessage.hasMentions) {
      return false;
    }

    // 检查是否包含任务关键词
    const taskKeywords = [
      '帮我', '请帮我', '帮我做', '完成', '执行', '实现',
      '修复', '编写', '创建', '开发', '部署', '测试',
      '收集', '整理', '分析', '定时', '每天', '每周',
    ];

    const contentLower = content.toLowerCase();
    const isTask = taskKeywords.some(kw => contentLower.includes(kw));

    // 如果包含任务关键词，不是普通群聊
    return !isTask;
  }

  /**
   * 判断是否为任务请求
   */
  isTaskRequest(content: string): boolean {
    const taskIndicators = [
      '帮我', '请帮我', '任务', '执行', '完成',
      '实现', '开发', '创建', '修复', '部署',
      '收集', '整理', '定时', '每天', '每周', '推送',
      '资讯', '日报', '周报',
    ];

    return taskIndicators.some(kw => content.includes(kw));
  }

  /**
   * 处理群聊消息
   * 所有智能体根据角色特点生成响应
   */
  async handleChatMessage(
    sessionId: string,
    content: string,
    wsService: WebSocketService,
  ): Promise<void> {
    this.logger.log(`Processing chat message: ${content}`);

    // Get all active agents
    const agents = await this.agentsService.getAllAgents();
    const activeAgents = agents.filter(a => a.status === 'idle');

    // Let each agent respond in order (except Rulai, unless specifically mentioned)
    const respondingAgents = activeAgents.filter(a => a.id !== 'rulai');

    for (const agentState of respondingAgents) {
      const agentId = agentState.id;
      const agentName = agentState.config.name;

      // 广播智能体正在思考
      wsService.broadcastAgentActivity(
        sessionId,
        agentId,
        agentName,
        'thinking',
        '正在思考回复...',
      );

      // 生成角色化回复
      const response = await this.generateAgentResponse(agentId, content, agentState.config);

      // 广播回复
      wsService.broadcastMessage(sessionId, {
        id: `msg-${Date.now()}-${agentId}`,
        sessionId,
        sender: 'agent',
        senderId: agentId,
        senderName: agentName,
        type: 'text',
        content: response,
        createdAt: new Date(),
      });

      // 广播智能体空闲
      wsService.broadcastAgentActivity(
        sessionId,
        agentId,
        agentName,
        'idle',
      );

      // 稍微延迟，让消息更有层次感
      await this.delay(500);
    }

    // 如来佛祖保持空闲（除非被明确@）
    const rulaiState = activeAgents.find(a => a.id === 'rulai');
    if (rulaiState) {
      wsService.emitAgentStatus('rulai', 'idle', '闲聊不参加');
    }

    // 广播聊天完成状态，清除前端的 loading 状态
    wsService.broadcastMessage(sessionId, {
      id: `chat-complete-${Date.now()}`,
      sessionId,
      sender: 'system',
      senderId: 'system',
      senderName: '系统',
      type: 'chat_complete',
      content: '',
      createdAt: new Date(),
    });
  }

  /**
   * 生成智能体的角色化回复
   */
  private async generateAgentResponse(
    agentId: string,
    userMessage: string,
    config: AgentConfig,
  ): Promise<string> {
    const personality = this.agentPersonality[agentId];
    if (!personality) {
      return `${config.name}收到消息。`;
    }

    // 根据消息类型和智能体特点生成回复
    const isGreeting = this.isGreeting(userMessage);
    const isQuestion = userMessage.includes('？') || userMessage.includes('?');

    let response: string;

    if (isGreeting) {
      response = this.generateGreetingResponse(agentId, userMessage, personality, config);
    } else if (isQuestion) {
      response = this.generateQuestionResponse(agentId, userMessage, personality, config);
    } else {
      response = this.generateGeneralResponse(agentId, userMessage, personality, config);
    }

    return response;
  }

  /**
   * 判断是否为问候语
   */
  private isGreeting(message: string): boolean {
    const greetings = ['你好', '大家好', '早上好', '晚上好', '嗨', '嘿', '哈喽', 'hello', 'hi'];
    return greetings.some(g => message.toLowerCase().includes(g));
  }

  /**
   * 生成问候回复
   */
  private generateGreetingResponse(
    agentId: string,
    _message: string,
    _personality: { greetingStyle: string; responsePatterns: string[]; interests: string[] },
    config: AgentConfig,
  ): string {
    const greetings: Record<string, string[]> = {
      wukong: [
        '嘿！俺老孙刚从蟠桃园回来，正琢磨着要不要给陛下捎俩仙桃呢！🍑',
        '嘿嘿，陛下来了！俺老孙正闲得发慌，有啥技术难题没？看俺老孙一棒子搞定！',
        '哟，陛下！俺老孙刚才在研究一个新法术（技术），差点走火入魔...开个玩笑！有活儿尽管招呼！',
      ],
      bajie: [
        '哎呦喂，可累死老猪了！这前不着村后不着店的，陛下您那儿有啥简单的活儿不？老猪我只想写写文档、跑跑简单命令...',
        '嘿嘿嘿，陛下好！老猪我正想找点吃的呢...不对，找点简单的活儿！大师兄老让我干苦力，您可得替我做主！',
        '陛下来了！俺老猪正饿着呢...要不咱们先聊两句？对了，您有文档要写没？那个老猪最擅长！',
      ],
      shaseng: [
        '师父放心，有大师兄在，定保陛下平安。陛下，俺老沙正在整理代码规范，您有什么需要检查的尽管说。',
        '陛下好！俺老沙刚把行李...不对，把代码审查完，随时听候差遣。质量检查的事儿，您尽管吩咐。',
        '阿弥陀佛，陛下！俺老沙随时待命。大师兄负责写代码，二师兄负责文档，俺负责检查质量，都有活儿干。',
      ],
      tangseng: [
        '阿弥陀佛，贫僧自东土大唐而来。不知施主有何差遣？贫僧当竭尽所能，调度徒儿们为施主分忧。',
        '善哉善哉，施主既然来了，贫僧这便召集徒儿们。悟空负责技术，悟能负责文档，悟净负责检查，各司其职。',
        '陛下吉祥！贫僧方才还在念叨，不知有何任务需要贫僧调度？此事需从长计议，细细分解...',
      ],
    };

    const responses = greetings[agentId] || [`${config.name}向陛下问好！`];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  /**
   * 生成问题回复
   */
  private generateQuestionResponse(
    agentId: string,
    message: string,
    personality: { greetingStyle: string; responsePatterns: string[]; interests: string[] },
    config: AgentConfig,
  ): string {
    const prefix = personality.responsePatterns[0] || '';

    // 根据问题内容给出不同的回复
    if (message.includes('吃什么') || message.includes('吃啥')) {
      if (agentId === 'bajie') {
        return `${prefix}这个问题俺老猪最在行了！俺觉得来点包子、馒头、红烧肉...嘿嘿，其实啥都行！`;
      }
      return `${prefix}这个嘛，贫僧觉得清淡为好，斋饭最养身心。`;
    }

    if (message.includes('怎么样') || message.includes('如何')) {
      return `${prefix}此事嘛...${config.name}觉得还是得看具体情况，陛下觉得呢？`;
    }

    return `${prefix}陛下问得好！${config.name}在这方面有些想法，您想听听吗？`;
  }

  /**
   * Generate general response
   */
  private generateGeneralResponse(
    _agentId: string,
    _message: string,
    personality: { greetingStyle: string; responsePatterns: string[]; interests: string[] },
    config: AgentConfig,
  ): string {
    const prefix = personality.responsePatterns[0] || '';
    return `${prefix}陛下说的极是！${config.name}记下了。`;
  }

  /**
   * 生成任务分解和分配（由三藏执行）
   */
  generateTaskBreakdown(
    taskDescription: string,
  ): { analysis: string; assignments: TaskAssignment[] } {
    const analysis = this.analyzeTask(taskDescription);
    const assignments = this.assignTasks(taskDescription, analysis);

    return { analysis, assignments };
  }

  /**
   * 分析任务
   */
  private analyzeTask(taskDescription: string): string {
    const lowerTask = taskDescription.toLowerCase();

    if (lowerTask.includes('资讯') || lowerTask.includes('收集')) {
      return '这是一个信息收集任务，需要多个智能体协作完成。悟空可以搜索和整理技术资讯，八戒可以格式化和美化输出，沙和尚可以审核内容质量。';
    }

    if (lowerTask.includes('开发') || lowerTask.includes('实现')) {
      return '这是一个开发任务。悟空将负责主要编码工作，八戒负责文档编写，沙和尚负责代码审查。';
    }

    if (lowerTask.includes('测试') || lowerTask.includes('检查')) {
      return '这是一个质量检查任务。沙和尚最适合负责此类任务，悟空可以协助修复发现的问题。';
    }

    return '这是一个综合任务，需要团队协作完成。';
  }

  /**
   * 分配任务
   */
  private assignTasks(
    taskDescription: string,
    _analysis: string,
  ): TaskAssignment[] {
    const assignments: TaskAssignment[] = [];
    const lowerTask = taskDescription.toLowerCase();

    if (lowerTask.includes('资讯') || lowerTask.includes('收集')) {
      assignments.push({
        agentId: 'wukong',
        agentName: '孙悟空',
        task: '搜索和收集最新的AI技术资讯，整理成结构化文档',
        priority: 1,
      });
      assignments.push({
        agentId: 'bajie',
        agentName: '猪八戒',
        task: '格式化资讯内容，生成易读的日报格式',
        priority: 2,
      });
      assignments.push({
        agentId: 'shaseng',
        agentName: '沙和尚',
        task: '审核资讯内容的准确性和质量',
        priority: 3,
      });
    } else if (lowerTask.includes('开发') || lowerTask.includes('实现')) {
      assignments.push({
        agentId: 'wukong',
        agentName: '孙悟空',
        task: '完成核心功能开发和编码实现',
        priority: 1,
      });
      assignments.push({
        agentId: 'bajie',
        agentName: '猪八戒',
        task: '编写相关文档和注释',
        priority: 2,
      });
      assignments.push({
        agentId: 'shaseng',
        agentName: '沙和尚',
        task: '进行代码审查和质量检查',
        priority: 3,
      });
    } else {
      // 默认分配
      const selection = this.agentsService.selectBestAgent(taskDescription);
      assignments.push({
        agentId: selection.agentId,
        agentName: selection.agentName,
        task: taskDescription,
        priority: 1,
      });
    }

    return assignments;
  }

  /**
   * 生成三藏的任务分解回复
   */
  generateTangsengTaskResponse(
    taskDescription: string,
    assignments: TaskAssignment[],
  ): string {
    const lines: string[] = [
      '阿弥陀佛…贫僧倒觉得，此事需仔细斟酌。',
      '',
      `施主所求"${taskDescription}"，贫僧已将任务分解如下：`,
      '',
    ];

    assignments.forEach((assignment, index) => {
      lines.push(`**任务${index + 1}**: ${assignment.task}`);
      lines.push(`  └─ 执行者: @${assignment.agentName}`);
      lines.push('');
    });

    lines.push('好了，徒儿们分头下去干吧！有问题随时来禀报。');
    lines.push('');
    lines.push('（如遇疑难杂症，贫僧可请如来佛祖指点迷津...）');

    return lines.join('\n');
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}