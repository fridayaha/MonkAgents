import api from './api.js';
import wsClient from './websocket.js';

class App {
  constructor() {
    this.currentSession = null;
    this.sessions = [];
    this.agents = [];

    this.init();
  }

  async init() {
    this.bindEvents();
    await this.loadAgents();
    await this.loadSessions();
    this.initWebSocket();
  }

  bindEvents() {
    // New session button
    document.getElementById('new-session-btn').addEventListener('click', () => {
      this.showModal();
    });

    // Modal buttons
    document.getElementById('cancel-modal-btn').addEventListener('click', () => {
      this.hideModal();
    });

    document.getElementById('create-session-btn').addEventListener('click', () => {
      this.createSession();
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

    // Close modal on outside click
    document.getElementById('new-session-modal').addEventListener('click', (e) => {
      if (e.target.id === 'new-session-modal') {
        this.hideModal();
      }
    });
  }

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
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  }

  renderAgents() {
    const container = document.getElementById('agents-list');
    container.innerHTML = this.agents.map(agent => `
      <div class="agent-item" data-agent-id="${agent.id}">
        <span class="agent-emoji">${agent.config.emoji}</span>
        <div class="agent-info">
          <div class="agent-name">${agent.config.name}</div>
          <div class="agent-role">${this.getRoleName(agent.config.role)}</div>
        </div>
        <span class="agent-status ${agent.status}" title="${agent.status}"></span>
      </div>
    `).join('');
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

  renderSessions() {
    const container = document.getElementById('sessions-list');
    container.innerHTML = this.sessions.map(session => `
      <div class="session-item ${this.currentSession?.id === session.id ? 'active' : ''}"
           data-session-id="${session.id}">
        <div class="session-item-title">${session.title || '未命名会话'}</div>
        <div class="session-item-meta">
          ${new Date(session.createdAt).toLocaleString('zh-CN')} · ${session.messageCount} 条消息
        </div>
      </div>
    `).join('');

    // Bind click events
    container.querySelectorAll('.session-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectSession(item.dataset.sessionId);
      });
    });
  }

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

  updateChatHeader() {
    document.getElementById('current-session-title').textContent =
      this.currentSession?.title || '未命名会话';
    document.getElementById('working-directory').textContent =
      this.currentSession?.workingDirectory || '';
  }

  renderMessages() {
    const container = document.getElementById('messages-container');

    if (!this.currentSession?.messages?.length) {
      container.innerHTML = `
        <div class="welcome-message">
          <p>👋 开始与智能体对话</p>
          <p>输入你的问题或任务</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.currentSession.messages.map(msg => `
      <div class="message ${msg.sender}">
        <div class="message-header">
          <span class="message-sender">${msg.senderName}</span>
          <span class="message-time">${new Date(msg.createdAt).toLocaleTimeString('zh-CN')}</span>
        </div>
        <div class="message-content">${this.formatContent(msg.content)}</div>
      </div>
    `).join('');

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  formatContent(content) {
    // Basic markdown-like formatting
    return content
      .replace(/\n/g, '<br>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  showModal() {
    document.getElementById('new-session-modal').classList.remove('hidden');
  }

  hideModal() {
    document.getElementById('new-session-modal').classList.add('hidden');
    document.getElementById('session-title').value = '';
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
      this.hideModal();
    } catch (error) {
      console.error('Failed to create session:', error);
      alert('创建会话失败');
    }
  }

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
      this.addMessage(message);
    });

    wsClient.on('agent_status', ({ agentId, status }) => {
      this.updateAgentStatus(agentId, status);
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
        content: `错误: ${error.message}`,
        createdAt: new Date(),
      });
    });
  }

  updateAgentStatus(agentId, status) {
    const agentItem = document.querySelector(`.agent-item[data-agent-id="${agentId}"] .agent-status`);
    if (agentItem) {
      agentItem.className = `agent-status ${status}`;
      agentItem.title = status;
    }
  }
}

// Initialize app
const app = new App();

export default app;