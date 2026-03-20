import api from './api.js';
import wsClient from './websocket.js';

/**
 * MonkAgents 主应用类
 */
class App {
  constructor() {
    this.currentPage = 'chat';
    this.currentSession = null;
    this.sessions = [];
    this.agents = [];
    this.tasks = [];
    this.scheduledTasks = [];

    this.init();
  }

  async init() {
    this.bindEvents();
    this.bindNavigation();
    await this.loadAgents();
    await this.loadSessions();
    await this.loadTasks();
    this.initWebSocket();
  }

  // ==================== Navigation ====================

  bindNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.dataset.page;
        this.switchPage(page);
      });
    });
  }

  switchPage(pageName) {
    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === pageName);
    });

    // Update pages
    document.querySelectorAll('.page').forEach(page => {
      page.classList.remove('active');
    });
    document.getElementById(`page-${pageName}`)?.classList.add('active');

    this.currentPage = pageName;

    // Load page-specific data
    if (pageName === 'tasks') {
      this.loadTasks();
    } else if (pageName === 'scheduled') {
      this.loadScheduledTasks();
    }
  }

  // ==================== Event Binding ====================

  bindEvents() {
    // New session button
    document.getElementById('new-session-btn').addEventListener('click', () => {
      this.showModal('new-session-modal');
    });

    // Modal buttons
    document.getElementById('cancel-modal-btn').addEventListener('click', () => {
      this.hideModal('new-session-modal');
    });

    document.getElementById('create-session-btn').addEventListener('click', () => {
      this.createSession();
    });

    // Browse directory button
    document.getElementById('browse-dir-btn')?.addEventListener('click', () => {
      document.getElementById('dir-picker')?.click();
    });

    // Directory picker change
    document.getElementById('dir-picker')?.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        // Get the directory path from the first file's webkitRelativePath
        const firstFile = files[0];
        const relativePath = firstFile.webkitRelativePath;
        const dirName = relativePath.split('/')[0];

        // Try to get the full path if available
        const fullPath = firstFile.path || dirName;
        document.getElementById('working-dir-input').value = fullPath;
      }
    });

    // Send message
    document.getElementById('send-btn').addEventListener('click', () => {
      this.sendMessage();
    });

    document.getElementById('message-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Close modals on outside click
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal && modal.id !== 'debug-page') {
          modal.classList.add('hidden');
        }
      });
    });

    // Debug button
    document.getElementById('debug-btn')?.addEventListener('click', () => {
      this.showDebugPage();
    });

    document.getElementById('close-debug-btn')?.addEventListener('click', () => {
      this.hideModal('debug-page');
    });

    // Task filters
    document.getElementById('task-status-filter')?.addEventListener('change', () => {
      this.loadTasks();
    });

    document.getElementById('task-session-filter')?.addEventListener('change', () => {
      this.loadTasks();
    });

    // Schedule buttons
    document.getElementById('new-schedule-btn')?.addEventListener('click', () => {
      this.showModal('new-schedule-modal');
    });

    document.getElementById('cancel-schedule-btn')?.addEventListener('click', () => {
      this.hideModal('new-schedule-modal');
    });

    document.getElementById('create-schedule-btn')?.addEventListener('click', () => {
      this.createScheduledTask();
    });
  }

  // ==================== API Data Loading ====================

  async loadAgents() {
    try {
      this.agents = await api.getAgents();
      this.renderAgents();
    } catch (error) {
      console.error('Failed to load agents:', error);
    }
  }

  async loadSessions() {
    try {
      this.sessions = await api.getSessions();
      this.renderSessions();
      this.updateSessionFilter();
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  }

  async loadTasks() {
    try {
      const statusFilter = document.getElementById('task-status-filter')?.value || '';
      const sessionFilter = document.getElementById('task-session-filter')?.value || '';

      let endpoint = '/tasks';
      const params = [];
      if (statusFilter) params.push(`status=${statusFilter}`);
      if (sessionFilter) params.push(`sessionId=${sessionFilter}`);
      if (params.length > 0) endpoint += '?' + params.join('&');

      this.tasks = await api.request(endpoint);
      this.renderTasks();
    } catch (error) {
      console.error('Failed to load tasks:', error);
      this.renderEmptyState('task-list', '📋', '暂无任务', '创建新会话开始任务');
    }
  }

  async loadScheduledTasks() {
    try {
      this.scheduledTasks = await api.request('/scheduled-tasks');
      this.renderScheduledTasks();
    } catch (error) {
      console.error('Failed to load scheduled tasks:', error);
      this.renderEmptyState('scheduled-list', '⏰', '暂无定时任务', '点击右上角按钮创建定时任务');
    }
  }

  // ==================== Rendering ====================

  renderAgents() {
    const container = document.getElementById('agents-list');
    if (!container) return;

    container.innerHTML = this.agents.map(agent => {
      const statusClass = this.getStatusClass(agent.status);
      const statusText = this.getStatusText(agent.status);

      return `
        <div class="agent-item" data-agent-id="${agent.id}">
          <div class="agent-avatar ${agent.id}">
            <span>${agent.config.emoji}</span>
            <span class="agent-status-indicator ${statusClass}"></span>
          </div>
          <div class="agent-info">
            <div class="agent-name">
              ${agent.config.name}
              <span style="font-size: 0.7rem; color: var(--text-muted);">${statusText}</span>
            </div>
            <div class="agent-role">${this.getRoleName(agent.config.role)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  renderSessions() {
    const container = document.getElementById('sessions-list');
    if (!container) return;

    if (this.sessions.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 24px;">
          <p style="font-size: 0.875rem;">暂无会话</p>
          <p style="font-size: 0.75rem; color: var(--text-muted);">点击"新建"创建会话</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.sessions.map(session => `
      <div class="session-item ${this.currentSession?.id === session.id ? 'active' : ''}"
           data-session-id="${session.id}">
        <div class="session-item-title">${session.title || '未命名会话'}</div>
        <div class="session-item-meta">
          ${this.formatRelativeTime(session.createdAt)} · ${session.messageCount || 0} 条消息
        </div>
        <button class="session-delete" data-session-id="${session.id}" title="删除会话">🗑</button>
      </div>
    `).join('');

    // Bind click events
    container.querySelectorAll('.session-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.classList.contains('session-delete')) {
          this.selectSession(item.dataset.sessionId);
        }
      });
    });

    // Bind delete events
    container.querySelectorAll('.session-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteSession(btn.dataset.sessionId);
      });
    });
  }

  renderMessages() {
    const container = document.getElementById('messages-container');

    if (!this.currentSession?.messages?.length) {
      container.innerHTML = `
        <div class="welcome-message">
          <h3>👋 开始与智能体对话</h3>
          <p>输入你的问题或任务</p>
          <p style="font-size: 0.875rem; color: #999; margin-top: 16px;">
            提示：使用 @智能体名称 可以召唤特定智能体<br>
            例如：@孙悟空 写一个函数
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.currentSession.messages.map(msg => this.renderMessage(msg)).join('');

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  renderMessage(msg) {
    const avatar = this.getMessageAvatar(msg);
    const typeClass = msg.type || 'text';

    let contentHtml = this.formatContent(msg.content);

    // Special rendering for tool_use
    if (msg.type === 'tool_use') {
      const toolName = msg.metadata?.toolName || 'unknown';
      const toolInput = msg.metadata?.input || {};
      contentHtml = `
        <div class="tool-header">
          <span class="tool-icon">🔧</span>
          <span class="tool-name">${toolName}</span>
        </div>
        <div class="tool-input">${this.escapeHtml(JSON.stringify(toolInput, null, 2))}</div>
      `;
    }

    // Special rendering for status
    if (msg.type === 'status') {
      return `
        <div class="message status">
          <div class="message-content">
            <span class="status-spinner"></span>
            <span>${msg.content}</span>
          </div>
        </div>
      `;
    }

    return `
      <div class="message ${msg.sender} ${typeClass}">
        <div class="message-header">
          <span class="message-avatar ${msg.senderId || ''}">${avatar}</span>
          <span class="message-sender">${msg.senderName}</span>
          <span class="message-time">${this.formatTime(msg.createdAt)}</span>
        </div>
        <div class="message-content">${contentHtml}</div>
      </div>
    `;
  }

  renderTasks() {
    const container = document.getElementById('task-list');
    if (!container) return;

    if (this.tasks.length === 0) {
      this.renderEmptyState('task-list', '📋', '暂无任务', '创建新会话开始任务');
      return;
    }

    container.innerHTML = this.tasks.map(task => `
      <div class="task-card" data-task-id="${task.id}">
        <div class="task-card-header">
          <div class="task-title">${task.title || '未命名任务'}</div>
          <span class="task-status ${task.status}">${this.getStatusText(task.status)}</span>
        </div>
        <div class="task-meta">
          <span>📁 ${task.sessionId?.substring(0, 8)}...</span>
          <span>🕐 ${this.formatTime(task.createdAt)}</span>
          <span>📊 ${task.subtasks?.length || 0} 个子任务</span>
        </div>
      </div>
    `).join('');

    // Bind click events
    container.querySelectorAll('.task-card').forEach(card => {
      card.addEventListener('click', () => {
        this.showTaskDetail(card.dataset.taskId);
      });
    });
  }

  renderScheduledTasks() {
    const container = document.getElementById('scheduled-list');
    if (!container) return;

    if (this.scheduledTasks.length === 0) {
      this.renderEmptyState('scheduled-list', '⏰', '暂无定时任务', '点击右上角按钮创建定时任务');
      return;
    }

    container.innerHTML = this.scheduledTasks.map(task => `
      <div class="schedule-card">
        <div class="schedule-header">
          <div class="schedule-title">${task.title}</div>
          <span class="task-status ${task.status}">${this.getStatusText(task.status)}</span>
        </div>
        <div class="schedule-description">${task.description || '无描述'}</div>
        <div class="task-meta" style="margin-bottom: 12px;">
          <span>⏰ ${this.formatTime(task.nextRunAt)}</span>
          <span>🔄 ${this.getRepeatText(task.repeat)}</span>
        </div>
        <div class="schedule-actions">
          <button class="btn btn-secondary btn-icon" onclick="app.runScheduledTask('${task.id}')">▶ 执行</button>
          <button class="btn btn-danger btn-icon" onclick="app.deleteScheduledTask('${task.id}')">🗑 删除</button>
        </div>
      </div>
    `).join('');
  }

  renderEmptyState(containerId, icon, title, description) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${icon}</div>
        <h3>${title}</h3>
        <p>${description}</p>
      </div>
    `;
  }

  // ==================== Session Management ====================

  async selectSession(sessionId) {
    try {
      this.currentSession = await api.getSession(sessionId);
      this.updateChatHeader();
      this.renderMessages();
      this.renderSessions(); // Update active state

      // Join WebSocket room
      if (wsClient.isConnected()) {
        wsClient.join(sessionId);
      }
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  }

  async createSession() {
    const title = document.getElementById('session-title').value.trim();
    const workingDir = document.getElementById('working-dir-input').value.trim() || '.';

    try {
      const session = await api.createSession({
        title: title || undefined,
        workingDirectory: workingDir,
      });

      this.sessions.unshift(session);
      this.renderSessions();
      this.selectSession(session.id);
      this.hideModal('new-session-modal');
      document.getElementById('session-title').value = '';
    } catch (error) {
      console.error('Failed to create session:', error);
      alert('创建会话失败');
    }
  }

  async deleteSession(sessionId) {
    if (!confirm('确定要删除此会话吗？')) return;

    try {
      await api.deleteSession(sessionId);
      this.sessions = this.sessions.filter(s => s.id !== sessionId);

      if (this.currentSession?.id === sessionId) {
        this.currentSession = null;
        this.updateChatHeader();
        document.getElementById('messages-container').innerHTML = `
          <div class="welcome-message">
            <h3>👋 选择或创建一个会话</h3>
          </div>
        `;
      }

      this.renderSessions();
    } catch (error) {
      console.error('Failed to delete session:', error);
      alert('删除会话失败');
    }
  }

  updateChatHeader() {
    document.getElementById('current-session-title').textContent =
      this.currentSession?.title || '未命名会话';
    document.getElementById('working-directory').innerHTML =
      this.currentSession?.workingDirectory ?
      `<span>📁</span> ${this.currentSession.workingDirectory}` : '';
  }

  updateSessionFilter() {
    const filter = document.getElementById('task-session-filter');
    if (!filter) return;

    filter.innerHTML = '<option value="">全部会话</option>' +
      this.sessions.map(s => `<option value="${s.id}">${s.title || '未命名会话'}</option>`).join('');
  }

  // ==================== Messaging ====================

  sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();

    if (!content) {
      return;
    }

    if (!this.currentSession) {
      alert('请先创建或选择一个会话');
      return;
    }

    // Clear input
    input.value = '';

    // Send via WebSocket
    wsClient.sendMessage(this.currentSession.id, content);

    // Add message to UI immediately
    this.addMessage({
      id: `temp-${Date.now()}`,
      sessionId: this.currentSession.id,
      sender: 'user',
      senderId: 'user',
      senderName: '你',
      type: 'text',
      content,
      createdAt: new Date(),
    });
  }

  addMessage(message) {
    if (!this.currentSession) return;

    if (!this.currentSession.messages) {
      this.currentSession.messages = [];
    }

    this.currentSession.messages.push(message);
    this.renderMessages();
  }

  removeLastStatusMessage() {
    if (!this.currentSession?.messages) return;

    // Find and remove the last status message (loading indicator)
    const messages = this.currentSession.messages;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === 'status') {
        messages.splice(i, 1);
        break;
      }
    }
    this.renderMessages();
  }

  // ==================== Scheduled Tasks ====================

  async createScheduledTask() {
    const title = document.getElementById('schedule-title').value.trim();
    const description = document.getElementById('schedule-description').value.trim();
    const time = document.getElementById('schedule-time').value;
    const repeat = document.getElementById('schedule-repeat').value;

    if (!title || !time) {
      alert('请填写任务标题和执行时间');
      return;
    }

    try {
      await api.request('/scheduled-tasks', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          schedule: time,
          repeat,
          context: { sessionId: this.currentSession?.id },
        }),
      });

      this.hideModal('new-schedule-modal');
      this.loadScheduledTasks();

      // Clear form
      document.getElementById('schedule-title').value = '';
      document.getElementById('schedule-description').value = '';
    } catch (error) {
      console.error('Failed to create scheduled task:', error);
      alert('创建定时任务失败');
    }
  }

  async deleteScheduledTask(taskId) {
    if (!confirm('确定要删除此定时任务吗？')) return;

    try {
      await api.request(`/api/scheduled-tasks/${taskId}`, { method: 'DELETE' });
      this.loadScheduledTasks();
    } catch (error) {
      console.error('Failed to delete scheduled task:', error);
    }
  }

  async runScheduledTask(taskId) {
    try {
      await api.request(`/api/scheduled-tasks/${taskId}/run`, { method: 'POST' });
      alert('任务已触发执行');
    } catch (error) {
      console.error('Failed to run scheduled task:', error);
      alert('执行失败');
    }
  }

  // ==================== Debug ====================

  async showDebugPage() {
    const taskId = this.currentSession?.currentTaskId;
    if (!taskId) {
      alert('当前没有正在执行的任务');
      return;
    }

    try {
      const debugInfo = await api.request(`/api/debug/${taskId}`);
      this.renderDebugInfo(debugInfo);
      this.showModal('debug-page');
    } catch (error) {
      console.error('Failed to load debug info:', error);
      alert('获取调试信息失败');
    }
  }

  renderDebugInfo(info) {
    const container = document.getElementById('debug-content');
    if (!container) return;

    container.innerHTML = `
      <div class="debug-section">
        <h3>📊 指标统计</h3>
        <div class="debug-metrics">
          <div class="metric-card">
            <div class="metric-label">Token 使用量</div>
            <div class="metric-value">${info.tokensUsed || 0}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">API 调用次数</div>
            <div class="metric-value">${info.apiCalls || 0}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">执行时间</div>
            <div class="metric-value">${info.duration ? `${info.duration}ms` : '-'}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">上下文大小</div>
            <div class="metric-value">${info.contextSize || 0} 条</div>
          </div>
        </div>
      </div>

      <div class="debug-section">
        <h3>🔧 工具调用</h3>
        <div class="tool-call-list">
          ${(info.toolCalls || []).map(call => `
            <div class="tool-call-item">
              <div class="tool-call-header">
                <span class="tool-call-name">${call.name}</span>
                <span class="tool-call-duration">${call.duration}ms</span>
              </div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">
                输入: ${this.escapeHtml(JSON.stringify(call.input).substring(0, 100))}...
              </div>
            </div>
          `).join('') || '<p style="color: var(--text-muted);">暂无工具调用</p>'}
        </div>
      </div>
    `;
  }

  // ==================== WebSocket ====================

  initWebSocket() {
    wsClient.connect();

    wsClient.on('connection', ({ connected }) => {
      const statusEl = document.getElementById('connection-status');
      if (connected) {
        statusEl.textContent = '已连接';
        statusEl.classList.remove('disconnected');
        statusEl.classList.add('connected');

        // Rejoin current session if any
        if (this.currentSession) {
          wsClient.join(this.currentSession.id);
        }
      } else {
        statusEl.textContent = '已断开';
        statusEl.classList.remove('connected');
        statusEl.classList.add('disconnected');
      }
    });

    wsClient.on('message', (message) => {
      // Handle chat_complete - remove the status loading message
      if (message.type === 'chat_complete') {
        this.removeLastStatusMessage();
        return;
      }
      this.addMessage(message);
    });

    wsClient.on('agent_status', ({ agentId, status, action }) => {
      this.updateAgentStatus(agentId, status, action);
    });

    wsClient.on('task_status', ({ taskId, status, message }) => {
      this.updateTaskStatus(taskId, status, message);
    });

    wsClient.on('stream', (chunk) => {
      this.handleStreamChunk(chunk);
    });

    wsClient.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.addMessage({
        id: `error-${Date.now()}`,
        sessionId: this.currentSession?.id,
        sender: 'system',
        senderId: 'system',
        senderName: '系统',
        type: 'error',
        content: `❌ 错误: ${error.message}`,
        createdAt: new Date(),
      });
    });
  }

  updateAgentStatus(agentId, status, action) {
    const agentItem = document.querySelector(`.agent-item[data-agent-id="${agentId}"]`);
    if (!agentItem) return;

    const indicator = agentItem.querySelector('.agent-status-indicator');
    const statusText = agentItem.querySelector('.agent-name span');

    if (indicator) {
      indicator.className = `agent-status-indicator ${this.getStatusClass(status)}`;
    }

    if (statusText) {
      statusText.textContent = this.getStatusText(status);
    }
  }

  updateTaskStatus(taskId, status, message) {
    // If on tasks page, reload tasks
    if (this.currentPage === 'tasks') {
      this.loadTasks();
    }
  }

  handleStreamChunk(chunk) {
    // Handle streaming output
    if (chunk.eventType === 'text' && chunk.content) {
      // Find or create a temporary message for streaming
      const container = document.getElementById('messages-container');
      const lastMessage = container.querySelector('.message.agent:last-child');

      if (lastMessage && lastMessage.dataset.streaming === 'true') {
        const content = lastMessage.querySelector('.message-content');
        content.textContent += chunk.content;
        container.scrollTop = container.scrollHeight;
      } else {
        // Create new streaming message
        this.addMessage({
          id: `stream-${Date.now()}`,
          sessionId: this.currentSession?.id,
          sender: 'agent',
          senderId: chunk.agentId || 'unknown',
          senderName: this.getAgentName(chunk.agentId) || '智能体',
          type: 'text',
          content: chunk.content,
          createdAt: new Date(),
        });
      }
    }
  }

  // ==================== Utilities ====================

  showModal(modalId) {
    document.getElementById(modalId)?.classList.remove('hidden');
  }

  hideModal(modalId) {
    document.getElementById(modalId)?.classList.add('hidden');
  }

  getRoleName(role) {
    const roles = {
      master: '师父',
      executor: '执行者',
      inspector: '检查者',
      assistant: '助手',
      advisor: '顾问',
    };
    return roles[role] || role;
  }

  getAgentName(agentId) {
    const agent = this.agents.find(a => a.id === agentId);
    return agent?.config?.name || agentId;
  }

  getMessageAvatar(msg) {
    if (msg.sender === 'user') return '👤';
    if (msg.sender === 'system') return '⚙';

    const agent = this.agents.find(a => a.id === msg.senderId);
    return agent?.config?.emoji || '🤖';
  }

  getStatusClass(status) {
    const classes = {
      idle: 'idle',
      thinking: 'thinking',
      executing: 'executing',
      offline: 'offline',
      pending: 'pending',
      completed: 'completed',
      failed: 'offline',
    };
    return classes[status] || 'idle';
  }

  getStatusText(status) {
    const texts = {
      idle: '空闲',
      thinking: '思考中',
      executing: '执行中',
      offline: '离线',
      pending: '等待中',
      completed: '已完成',
      failed: '失败',
    };
    return texts[status] || status;
  }

  getRepeatText(repeat) {
    const texts = {
      once: '仅一次',
      daily: '每天',
      weekly: '每周',
    };
    return texts[repeat] || repeat;
  }

  formatContent(content) {
    if (!content) return '';

    // Escape HTML
    let formatted = this.escapeHtml(content);

    // Code blocks
    formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');

    // Inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Newlines
    formatted = formatted.replace(/\n/g, '<br>');

    return formatted;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatTime(date) {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  formatRelativeTime(date) {
    if (!date) return '-';
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;

    return d.toLocaleDateString('zh-CN');
  }
}

// Initialize app
const app = new App();
window.app = app; // Expose for inline onclick handlers

export default app;