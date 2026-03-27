import { icons, getIcon } from './icons.js';

/**
 * 工具状态枚举
 */
export const ToolStatus = {
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  ERROR: 'error',
  CANCELLED: 'cancelled'
};

/**
 * 工具状态文本映射
 */
const StatusText = {
  [ToolStatus.IN_PROGRESS]: '执行中',
  [ToolStatus.COMPLETED]: '完成',
  [ToolStatus.ERROR]: '错误',
  [ToolStatus.CANCELLED]: '已取消'
};

/**
 * 工具状态管理器
 * 负责工具消息的渲染、状态更新和图标管理
 */
export class ToolManager {
  constructor(app) {
    this.app = app;
    this.activeTools = new Map(); // 追踪正在执行的工具
    this.timers = new Map(); // 执行时间计时器
    this.startTime = new Map(); // 记录开始时间
  }

  /**
   * 工具图标配置
   * icon: icons.js 中的图标名称
   * color: 图标颜色
   */
  static TOOL_CONFIG = {
    Read: { icon: 'file', color: '#3b82f6', label: '读取文件' },
    Write: { icon: 'filePlus', color: '#22c55e', label: '写入文件' },
    Edit: { icon: 'edit', color: '#f59e0b', label: '编辑文件' },
    Bash: { icon: 'terminal', color: '#8b5cf6', label: '执行命令' },
    Glob: { icon: 'fileSearch', color: '#06b6d4', label: '搜索文件' },
    Grep: { icon: 'search', color: '#ec4899', label: '搜索内容' },
    WebFetch: { icon: 'globe', color: '#14b8a6', label: '获取网页' },
    WebSearch: { icon: 'search', color: '#6366f1', label: '网络搜索' },
    Agent: { icon: 'bot', color: '#f97316', label: '调用智能体' },
    TaskOutput: { icon: 'clipboard', color: '#84cc16', label: '获取任务输出' },
    default: { icon: 'tool', color: '#64748b', label: '工具调用' }
  };

  /**
   * 获取工具配置
   * @param {string} toolName - 工具名称
   * @returns {{icon: string, color: string, label: string}}
   */
  getToolConfig(toolName) {
    return ToolManager.TOOL_CONFIG[toolName] || ToolManager.TOOL_CONFIG.default;
  }

  /**
   * 获取工具图标 HTML
   * @param {string} toolName - 工具名称
   * @param {number} size - 图标大小
   * @returns {string} SVG HTML 字符串
   */
  getToolIcon(toolName, size = 16) {
    const config = this.getToolConfig(toolName);
    const iconSvg = getIcon(config.icon) || getIcon('tool');
    if (!iconSvg) return '';

    return iconSvg.replace(
      '<svg',
      `<svg width="${size}" height="${size}" style="color: ${config.color}"`
    );
  }

  /**
   * 获取工具摘要文本
   * @param {string} toolName - 工具名称
   * @param {object} input - 工具输入参数
   * @returns {string|null} 摘要 HTML 字符串
   */
  getToolSummary(toolName, input) {
    switch (toolName) {
      case 'Read':
        return input.file_path ? `读取文件: <code>${this.escapeHtml(input.file_path)}</code>` : null;
      case 'Edit':
        return input.file_path ? `编辑文件: <code>${this.escapeHtml(input.file_path)}</code>` : null;
      case 'Write':
        return input.file_path ? `写入文件: <code>${this.escapeHtml(input.file_path)}</code>` : null;
      case 'Bash':
        return input.command ? `执行命令: <code>${this.escapeHtml(input.command.substring(0, 50))}${input.command.length > 50 ? '...' : ''}</code>` : null;
      case 'Glob':
        return input.pattern ? `搜索文件: <code>${this.escapeHtml(input.pattern)}</code>` : null;
      case 'Grep':
        return input.pattern ? `搜索内容: <code>${this.escapeHtml(input.pattern)}</code>` : null;
      case 'WebFetch':
        return input.url ? `获取网页: <code>${this.escapeHtml(input.url.substring(0, 50))}${input.url.length > 50 ? '...' : ''}</code>` : null;
      case 'WebSearch':
        return input.query ? `搜索: <code>${this.escapeHtml(input.query)}</code>` : null;
      case 'TaskOutput':
        return `获取任务输出`;
      case 'Agent':
        return input.subagent_type ? `调用智能体: <code>${this.escapeHtml(input.subagent_type)}</code>` : null;
      default:
        return null;
    }
  }

  /**
   * 转义 HTML 特殊字符
   * @param {string} str - 原始字符串
   * @returns {string} 转义后的字符串
   */
  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * 获取状态图标
   * @param {ToolStatus} status - 工具状态
   * @returns {string} SVG HTML 字符串
   */
  getStatusIcon(status) {
    switch (status) {
      case ToolStatus.IN_PROGRESS:
        return `<svg class="tool-call-icon loading" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="1"/>
        </svg>`;
      case ToolStatus.COMPLETED:
        return `<svg class="tool-call-icon success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>`;
      case ToolStatus.ERROR:
        return `<svg class="tool-call-icon error" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>`;
      case ToolStatus.CANCELLED:
        return `<svg class="tool-call-icon cancelled" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>`;
      default:
        return '';
    }
  }

  /**
   * 格式化持续时间
   * @param {number} durationMs - 持续时间（毫秒）
   * @returns {string} 格式化的时间字符串
   */
  formatDuration(durationMs) {
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    const ms = Math.floor((durationMs % 1000) / 10);

    if (minutes > 0) {
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }
    return `${seconds}.${ms.toString().padStart(2, '0')}s`;
  }

  /**
   * 开始计时器
   * @param {string} toolId - 工具ID
   */
  startTimer(toolId) {
    this.startTime.set(toolId, Date.now());

    // 更新显示
    const timerElement = document.querySelector(`[data-tool-id="${toolId}"] .tool-call-timer`);
    if (timerElement) {
      const updateTimer = () => {
        const elapsed = Date.now() - this.startTime.get(toolId);
        timerElement.textContent = this.formatDuration(elapsed);
      };

      const timer = setInterval(updateTimer, 100);
      this.timers.set(toolId, timer);
      updateTimer(); // 立即显示初始时间
    }
  }

  /**
   * 停止计时器
   * @param {string} toolId - 工具ID
   * @returns {number} 执行时长（毫秒）
   */
  stopTimer(toolId) {
    const timer = this.timers.get(toolId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(toolId);
    }

    const startTime = this.startTime.get(toolId);
    let duration = 0;
    if (startTime) {
      duration = Date.now() - startTime;
      this.startTime.delete(toolId);
    }

    this.activeTools.delete(toolId);
    return duration;
  }

  /**
   * 渲染工具卡片（紧凑单行布局）
   * @param {object} msg - 消息对象
   * @param {object} options - 渲染选项
   * @returns {string} HTML 字符串
   */
  renderToolCard(msg, options = {}) {
    const toolName = msg.metadata?.toolName || 'unknown';
    const toolInput = msg.metadata?.input || {};
    const status = msg.metadata?.status || (msg.metadata?.isComplete ? ToolStatus.COMPLETED : ToolStatus.IN_PROGRESS);
    const duration = msg.metadata?.duration;
    const toolId = msg.id || `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const errorMessage = msg.metadata?.error;

    const config = this.getToolConfig(toolName);
    const toolIcon = this.getToolIcon(toolName);
    const toolSummary = this.getToolSummary(toolName, toolInput);
    const statusText = StatusText[status] || '执行中';

    // 构建时间显示
    let timeHtml = '';
    if (status === ToolStatus.IN_PROGRESS) {
      timeHtml = `<span class="tool-call-timer">0.00s</span>`;
    } else if (duration) {
      timeHtml = `<span class="tool-call-duration">${this.formatDuration(duration)}</span>`;
    }

    // 构建状态标签
    const statusHtml = `<span class="tool-call-status ${status}">${statusText}</span>`;

    // 构建详情部分（点击展开）
    let detailsHtml = '';
    if (status === ToolStatus.COMPLETED && Object.keys(toolInput).length > 0) {
      detailsHtml = `
        <details class="tool-call-details">
          <summary>详情</summary>
          <div class="tool-call-input"><pre><code>${this.escapeHtml(JSON.stringify(toolInput, null, 2))}</code></pre></div>
        </details>
      `;
    } else if (status === ToolStatus.ERROR && errorMessage) {
      detailsHtml = `
        <details class="tool-call-details error">
          <summary>错误</summary>
          <div class="tool-call-error"><pre><code>${this.escapeHtml(errorMessage)}</code></pre></div>
        </details>
      `;
    }

    // 紧凑单行布局
    return `
      <span class="tool-call-card" data-tool-id="${toolId}" data-tool-name="${toolName}">
        <span class="tool-call-icon-wrapper" style="color: ${config.color}">${toolIcon}</span>
        <span class="tool-call-name">${toolName}</span>
        ${toolSummary ? `<span class="tool-call-summary">${toolSummary}</span>` : ''}
        ${statusHtml}
        ${timeHtml}
        ${detailsHtml}
      </span>
    `;
  }

  /**
   * 更新工具卡片状态
   * @param {string} toolId - 工具ID
   * @param {ToolStatus} status - 新状态
   * @param {object} metadata - 额外元数据
   */
  updateToolStatus(toolId, status, metadata = {}) {
    const card = document.querySelector(`[data-tool-id="${toolId}"]`);
    if (!card) return;

    // 停止计时器并获取持续时间
    const duration = this.stopTimer(toolId);

    // 更新状态标签
    const statusEl = card.querySelector('.tool-call-status');
    if (statusEl) {
      statusEl.className = `tool-call-status ${status}`;
      statusEl.textContent = StatusText[status] || status;
    }

    // 更新图标颜色（根据状态变化）
    const iconWrapper = card.querySelector('.tool-call-icon-wrapper');
    if (iconWrapper) {
      const toolName = card.dataset.toolName;
      const config = this.getToolConfig(toolName);
      // 错误状态用红色，取消状态用灰色，其他用原色
      const color = status === ToolStatus.ERROR ? '#ef4444' :
                    status === ToolStatus.CANCELLED ? '#94a3b8' :
                    config.color;
      iconWrapper.style.color = color;
    }

    // 更新时间显示
    const timerEl = card.querySelector('.tool-call-timer');
    if (timerEl && (metadata.duration || duration)) {
      const finalDuration = metadata.duration || duration;
      timerEl.className = 'tool-call-duration';
      timerEl.textContent = this.formatDuration(finalDuration);
    }

    // 如果有错误，添加错误详情
    if (status === ToolStatus.ERROR && metadata.error) {
      if (!card.querySelector('.tool-call-details')) {
        const errorDetails = `
          <details class="tool-call-details error">
            <summary>错误</summary>
            <div class="tool-call-error"><pre><code>${this.escapeHtml(metadata.error)}</code></pre></div>
          </details>
        `;
        card.insertAdjacentHTML('beforeend', errorDetails);
      }
    }
  }

  /**
   * 渲染工具使用消息（兼容旧接口）
   * @param {object} msg - 消息对象
   * @returns {string} HTML 字符串
   */
  renderToolUseMessage(msg) {
    return this.renderToolCard(msg, { isGrouped: false });
  }

  /**
   * 清理所有活跃的工具和计时器
   */
  cleanup() {
    // 停止所有计时器
    for (const [toolId, timer] of this.timers) {
      clearInterval(timer);
    }
    this.timers.clear();
    this.startTime.clear();
    this.activeTools.clear();
  }
}

export default ToolManager;