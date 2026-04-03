import api from './api.js';
import wsClient from './websocket.js';
import { icons, getIcon } from './icons.js';
import { ToolManager, ToolStatus } from './tool-manager.js';

// Import agent avatar SVGs (Vite will handle these as assets)
import tangsengAvatar from '../images/tangseng.svg';
import wukongAvatar from '../images/wukong.svg';
import bajieAvatar from '../images/bajie.svg';
import shasengAvatar from '../images/shaseng.svg';
import rulaiAvatar from '../images/rulai.svg';
import meAvatar from '../images/me.svg';

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

    // DOM 元素缓存（在 initDomCache 中初始化）
    this.dom = {};

    // Mention menu state
    this.mentionMenuVisible = false;
    this.mentionStartIndex = -1;
    this.mentionQuery = '';
    this.selectedMentionIndex = 0;

    // Loading state
    this.isLoadingShowing = false;
    this.animationInterval = null; // 合并 loading 和 thinking 动画定时器
    this.loadingAgentId = null;

    // Thinking state
    this.isThinkingShowing = false;

    // Generation state
    this.isGenerating = false;
    this.currentTaskId = null;
    this.isCancelled = false;  // Track if current task was cancelled

    // Tool manager
    this.toolManager = new ToolManager(this);

    this.init();
  }

  /**
   * 缓存常用 DOM 元素引用，避免重复查询
   */
  initDomCache() {
    this.dom = {
      // 主要容器
      messagesContainer: document.getElementById('messages-container'),
      messageInput: document.getElementById('message-input'),
      sendBtn: document.getElementById('send-btn'),

      // 列表容器
      agentsList: document.getElementById('agents-list'),
      sessionsList: document.getElementById('sessions-list'),
      taskList: document.getElementById('task-list'),
      scheduledList: document.getElementById('scheduled-list'),

      // 团队状态面板
      teamStatusPanel: document.getElementById('team-status-panel'),
      teamStatusBadge: document.getElementById('team-status-badge'),
      teamMembersList: document.getElementById('team-members-list'),

      // 移动端抽屉
      drawerOverlay: document.getElementById('drawer-overlay'),
      sessionsDrawer: document.getElementById('sessions-drawer'),
      agentsDrawer: document.getElementById('agents-drawer'),
      mobileMenuBtn: document.getElementById('mobile-menu-btn'),
      mobileAgentsBtn: document.getElementById('mobile-agents-btn'),
      sessionsListDrawer: document.getElementById('sessions-list-drawer'),
      agentsListDrawer: document.getElementById('agents-list-drawer'),

      // 头部元素
      connectionStatus: document.getElementById('connection-status'),
      currentSessionTitle: document.getElementById('current-session-title'),
      workingDirectory: document.getElementById('working-directory'),

      // 过滤器
      taskStatusFilter: document.getElementById('task-status-filter'),
      taskSessionFilter: document.getElementById('task-session-filter'),

      // 按钮元素
      themeToggle: document.getElementById('theme-toggle'),
      newSessionBtn: document.getElementById('new-session-btn'),
      debugBtn: document.getElementById('debug-btn'),
      closeDebugBtn: document.getElementById('close-debug-btn'),

      // 模态框
      debugPage: document.getElementById('debug-page'),
      debugContent: document.getElementById('debug-content'),
      newSessionModal: document.getElementById('new-session-modal'),
      newScheduleModal: document.getElementById('new-schedule-modal'),
      customDialogModal: document.getElementById('custom-dialog-modal'),
      dialogTitle: document.getElementById('dialog-title'),
      dialogMessage: document.getElementById('dialog-message'),
      dialogConfirmBtn: document.getElementById('dialog-confirm-btn'),
      dialogCancelBtn: document.getElementById('dialog-cancel-btn'),

      // Mention 菜单
      mentionMenu: document.getElementById('mention-menu'),

      // 表单元素
      sessionTitle: document.getElementById('session-title'),
      workingDirInput: document.getElementById('working-dir-input'),
      scheduleTitle: document.getElementById('schedule-title'),
      scheduleDescription: document.getElementById('schedule-description'),
      scheduleTime: document.getElementById('schedule-time'),
      scheduleRepeat: document.getElementById('schedule-repeat'),
    };
  }

  async init() {
    this.initDomCache(); // 首先缓存 DOM 引用
    this.initMarked(); // 初始化 marked 配置（只执行一次）
    this.initTheme();
    this.initIcons();
    this.bindEvents();
    this.bindNavigation();
    this.initEventDelegation(); // 初始化事件委托
    await this.loadAgents();
    await this.loadSessions();
    await this.loadTasks();
    this.initWebSocket();
    this.initMentionMenu();
    this.initMobileDrawers();
    this.autoSelectRecentSession();
    // Initialize send button state
    this.updateSendButtonState();
  }

  /**
   * 初始化 marked.js 配置（只执行一次）
   */
  initMarked() {
    if (typeof marked !== 'undefined') {
      marked.setOptions({
        breaks: true,
        gfm: true,
        highlight: (code, lang) => {
          if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
            try {
              return hljs.highlight(code, { language: lang }).value;
            } catch (e) {
              // Ignore highlight errors
            }
          }
          return code;
        }
      });
    }
  }

  // ==================== Mobile Drawers ====================

  initMobileDrawers() {
    const { drawerOverlay, mobileMenuBtn, mobileAgentsBtn } = this.dom;

    // Toggle sessions drawer
    mobileMenuBtn?.addEventListener('click', () => {
      this.toggleDrawer('sessions');
    });

    // Toggle agents drawer
    mobileAgentsBtn?.addEventListener('click', () => {
      this.toggleDrawer('agents');
    });

    // Close on overlay click
    drawerOverlay?.addEventListener('click', () => {
      this.closeAllDrawers();
    });

    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllDrawers();
      }
    });
  }

  toggleDrawer(type) {
    const { drawerOverlay, sessionsDrawer, agentsDrawer } = this.dom;

    if (type === 'sessions') {
      const isOpen = sessionsDrawer?.classList.contains('open');
      this.closeAllDrawers();
      if (!isOpen) {
        sessionsDrawer?.classList.add('open');
        drawerOverlay?.classList.add('visible');
        this.syncDrawerContent('sessions');
      }
    } else if (type === 'agents') {
      const isOpen = agentsDrawer?.classList.contains('open');
      this.closeAllDrawers();
      if (!isOpen) {
        agentsDrawer?.classList.add('open');
        drawerOverlay?.classList.add('visible');
        this.syncDrawerContent('agents');
      }
    }
  }

  closeAllDrawers() {
    const { drawerOverlay } = this.dom;
    document.querySelectorAll('.sidebar-drawer').forEach(drawer => {
      drawer.classList.remove('open');
    });
    drawerOverlay?.classList.remove('visible');
  }

  syncDrawerContent(type) {
    const { sessionsList, agentsList, sessionsListDrawer, agentsListDrawer, messageInput } = this.dom;

    if (type === 'sessions') {
      if (sessionsList && sessionsListDrawer) {
        sessionsListDrawer.innerHTML = sessionsList.innerHTML;
        // 使用事件委托，不需要重新绑定每个元素
      }
    } else if (type === 'agents') {
      if (agentsList && agentsListDrawer) {
        agentsListDrawer.innerHTML = agentsList.innerHTML;
        // 使用事件委托，不需要重新绑定每个元素
      }
    }
  }

  // ==================== Event Delegation ====================

  /**
   * 初始化事件委托，避免重复绑定事件监听器
   */
  initEventDelegation() {
    // 会话列表点击事件委托
    this.dom.sessionsList?.addEventListener('click', (e) => {
      const sessionItem = e.target.closest('.session-item');
      const deleteBtn = e.target.closest('.session-delete');

      if (deleteBtn) {
        e.stopPropagation();
        this.deleteSession(deleteBtn.dataset.sessionId);
      } else if (sessionItem) {
        this.selectSession(sessionItem.dataset.sessionId);
      }
    });

    // 移动端会话抽屉点击事件委托
    this.dom.sessionsListDrawer?.addEventListener('click', (e) => {
      const sessionItem = e.target.closest('.session-item');
      const deleteBtn = e.target.closest('.session-delete');

      if (deleteBtn) {
        e.stopPropagation();
        this.deleteSession(deleteBtn.dataset.sessionId);
      } else if (sessionItem) {
        this.selectSession(sessionItem.dataset.sessionId);
        this.closeAllDrawers();
      }
    });

    // 智能体列表点击事件委托
    this.dom.agentsList?.addEventListener('click', (e) => {
      const agentItem = e.target.closest('.agent-item');
      if (agentItem) {
        this.handleAgentClick(agentItem.dataset.agentId);
      }
    });

    // 移动端智能体抽屉点击事件委托
    this.dom.agentsListDrawer?.addEventListener('click', (e) => {
      const agentItem = e.target.closest('.agent-item');
      if (agentItem) {
        this.handleAgentClick(agentItem.dataset.agentId);
        this.closeAllDrawers();
      }
    });

    // 任务列表点击事件委托
    this.dom.taskList?.addEventListener('click', (e) => {
      const taskCard = e.target.closest('.task-card');
      if (taskCard) {
        this.showTaskDetail(taskCard.dataset.taskId);
      }
    });
  }

  /**
   * 处理智能体点击（从侧边栏召唤）
   */
  handleAgentClick(agentId) {
    const agent = this.agents.find(a => a.id === agentId);
    if (agent) {
      const input = this.dom.messageInput;
      const currentValue = input.value.trim();
      input.value = currentValue ? `${currentValue} @${agent.config.name} ` : `@${agent.config.name} `;
      input.focus();
      this.updateSendButtonState();
    }
  }

  // ==================== Theme Management ====================

  initTheme() {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      }
    });
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  }

  // ==================== Icon Initialization ====================

  initIcons() {
    // Logo is now an img element, no need to set icon

    // Navigation icons
    this.setIcon('nav-icon-chat', 'chat', 18);
    this.setIcon('nav-icon-tasks', 'tasks', 18);
    this.setIcon('nav-icon-scheduled', 'scheduled', 18);

    // Theme toggle icons
    this.setIcon('theme-moon-icon', 'moon', 20);
    this.setIcon('theme-sun-icon', 'sun', 20);

    // Header icons
    this.setIcon('new-session-icon', 'add', 16);
    this.setIcon('debug-icon', 'debug', 18);

    // Page icons
    this.setIcon('tasks-page-icon', 'tasks', 24);
    this.setIcon('scheduled-page-icon', 'scheduled', 24);
    this.setIcon('crown-icon', 'crown', 24);

    // Close icons
    this.setIcon('close-tasks-icon', 'close', 16);
    this.setIcon('close-scheduled-icon', 'close', 16);
    this.setIcon('close-debug-modal-icon', 'close', 18);
    this.setIcon('debug-modal-icon', 'debug', 20);

    // Modal icons
    this.setIcon('random-icon', 'random', 16);
    this.setIcon('browse-icon', 'browse', 16);

    // Close modal icons
    document.querySelectorAll('.close-modal-icon').forEach(el => {
      el.innerHTML = getIcon('close');
    });

    // New schedule icon
    this.setIcon('new-schedule-icon', 'add', 16);
  }

  setIcon(elementId, iconName, size = 24) {
    const el = document.getElementById(elementId);
    if (el) {
      el.innerHTML = getIcon(iconName);
      const svg = el.querySelector('svg');
      if (svg) {
        svg.setAttribute('width', size);
        svg.setAttribute('height', size);
      }
    }
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
    const {
      themeToggle, newSessionBtn, sendBtn, messageInput,
      debugBtn, closeDebugBtn, taskStatusFilter, taskSessionFilter,
      newScheduleBtn, newSessionModal, debugPage
    } = this.dom;

    // Theme toggle
    themeToggle?.addEventListener('click', () => {
      this.toggleTheme();
    });

    // New session button
    newSessionBtn?.addEventListener('click', () => {
      this.showModal('new-session-modal');
      // Auto-generate random title when opening modal
      this.generateRandomTitle();
    });

    // Modal buttons
    document.getElementById('cancel-modal-btn')?.addEventListener('click', () => {
      this.hideModal('new-session-modal');
    });

    document.getElementById('create-session-btn')?.addEventListener('click', () => {
      this.createSession();
    });

    // Random title button
    document.getElementById('random-title-btn')?.addEventListener('click', () => {
      this.generateRandomTitle();
    });

    // Browse directory button - use server-side directory browser
    document.getElementById('browse-dir-btn')?.addEventListener('click', async () => {
      await this.showDirectoryBrowser();
    });

    // Send message
    sendBtn?.addEventListener('click', () => {
      this.sendMessage();
    });

    messageInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Update send button state based on input content
    messageInput?.addEventListener('input', () => {
      this.updateSendButtonState();
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
    debugBtn?.addEventListener('click', () => {
      this.showDebugPage();
    });

    closeDebugBtn?.addEventListener('click', () => {
      this.hideModal('debug-page');
    });

    // Task filters
    taskStatusFilter?.addEventListener('change', () => {
      this.loadTasks();
    });

    taskSessionFilter?.addEventListener('change', () => {
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

    // Modal close buttons (X buttons in modal headers)
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.dataset.modal;
        if (modalId) {
          this.hideModal(modalId);
        }
      });
    });

    // Page close buttons (return to chat page)
    document.querySelectorAll('.btn-close-page').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page || 'chat';
        this.switchPage(page);
      });
    });

    // Click outside modal to close
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
        }
      });
    });
  }

  // ==================== API Data Loading ====================

  async loadAgents() {
    try {
      this.agents = await api.getAgents();
      this.renderAgents();
    } catch (error) {
      // Failed to load agents
    }
  }

  async loadSessions() {
    try {
      this.sessions = await api.getSessions();
      this.renderSessions();
      this.updateSessionFilter();
    } catch (error) {
      // Failed to load sessions
    }
  }

  async loadTasks() {
    try {
      const { taskStatusFilter, taskSessionFilter } = this.dom;
      const statusFilter = taskStatusFilter?.value || '';
      const sessionFilter = taskSessionFilter?.value || '';

      let endpoint = '/tasks';
      const params = [];
      if (statusFilter) params.push(`status=${statusFilter}`);
      if (sessionFilter) params.push(`sessionId=${sessionFilter}`);
      if (params.length > 0) endpoint += '?' + params.join('&');

      this.tasks = await api.request(endpoint);
      this.renderTasks();
    } catch (error) {
      this.renderEmptyState('task-list', 'tasks', '暂无任务', '创建新会话开始任务');
    }
  }

  async loadScheduledTasks() {
    try {
      this.scheduledTasks = await api.request('/scheduled-tasks');
      this.renderScheduledTasks();
    } catch (error) {
      this.renderEmptyState('scheduled-list', 'scheduled', '暂无定时任务', '点击右上角按钮创建定时任务');
    }
  }

  // ==================== Rendering ====================

  // Agent avatar SVG mapping
  getAgentAvatar(agentId) {
    const avatarMap = {
      tangseng: tangsengAvatar,
      wukong: wukongAvatar,
      bajie: bajieAvatar,
      shaseng: shasengAvatar,
      rulai: rulaiAvatar
    };
    return avatarMap[agentId] || null;
  }

  getUserAvatar() {
    return meAvatar;
  }

  renderAgents() {
    const container = this.dom.agentsList;
    if (!container) return;

    container.innerHTML = this.agents.map(agent => {
      const statusClass = this.getStatusClass(agent.status);
      const statusText = this.getStatusText(agent.status);
      const avatarSrc = this.getAgentAvatar(agent.id);

      return `
        <div class="agent-item" data-agent-id="${agent.id}" title="点击召唤 ${agent.config.name}">
          <div class="agent-avatar ${agent.id}">
            ${avatarSrc
              ? `<img src="${avatarSrc}" alt="${agent.config.name}" class="avatar-img" />`
              : `<span>${agent.config.emoji}</span>`
            }
            <span class="agent-status-indicator ${statusClass}"></span>
          </div>
          <div class="agent-info">
            <div class="agent-name">
              ${agent.config.name}
              <span style="font-size: 0.7rem; color: var(--on-surface-muted);">${statusText}</span>
            </div>
            <div class="agent-role">${this.getRoleName(agent.config.role)}</div>
          </div>
        </div>
      `;
    }).join('');
    // 事件委托在 initEventDelegation 中处理，无需单独绑定
  }

  renderSessions() {
    const container = this.dom.sessionsList;
    if (!container) return;

    if (this.sessions.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 24px;">
          <p style="font-size: 0.875rem;">暂无会话</p>
          <p style="font-size: 0.75rem; color: var(--on-surface-muted);">点击"新建"创建会话</p>
        </div>
      `;
      return;
    }

    const deleteIcon = getIcon('delete');

    container.innerHTML = this.sessions.map(session => `
      <div class="session-item ${this.currentSession?.id === session.id ? 'active' : ''}"
           data-session-id="${session.id}">
        <div class="session-item-title">${session.title || '未命名会话'}</div>
        <div class="session-item-meta">
          ${this.formatRelativeTime(session.createdAt)} · ${session.messageCount || 0} 条消息
        </div>
        <button class="session-delete" data-session-id="${session.id}" title="删除会话">${deleteIcon}</button>
      </div>
    `).join('');
    // 事件委托在 initEventDelegation 中处理，无需单独绑定
  }

  renderMessages() {
    const container = this.dom.messagesContainer;

    if (!this.currentSession?.messages?.length) {
      container.innerHTML = `
        <div class="welcome-message">
          <h3>
            <span id="crown-icon" style="display: inline-flex; vertical-align: middle; margin-right: 8px;"></span>
            欢迎使用 MonkAgents
          </h3>
          <p>唐太宗陛下，选择或创建一个会话开始与智能体协作</p>
          <p style="font-size: 0.875rem; color: var(--on-surface-muted); margin-top: 16px;">
            提示：使用 @智能体名称 可以召唤特定智能体<br>
            例如：@孙悟空 写一个函数
          </p>
        </div>
      `;
      // Re-init crown icon
      this.setIcon('crown-icon', 'crown', 24);
      return;
    }

    // Group consecutive messages from the same sender
    const groups = this.groupMessages(this.currentSession.messages);

    // Render message groups
    const rendered = groups.map(group => this.renderMessageGroup(group))
      .filter(html => html.length > 0);

    container.innerHTML = rendered.join('');

    // Restore loading indicator if it was showing
    if (this.isLoadingShowing) {
      this.appendLoadingIndicator(container);
    }

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  appendLoadingIndicator(container) {
    // Loading效果直接展示，不需要智能体消息框包裹
    const loadingHtml = `
      <div class="thinking-indicator" id="loading-indicator">
        <div class="thinking-spinner"></div>
        <span class="thinking-text">正在思考</span><span class="loading-dots"></span>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', loadingHtml);
  }

  updateLoadingAgent(agentId) {
    // Only update if loading is showing and agent changed
    if (this.isLoadingShowing && agentId && this.loadingAgentId !== agentId) {
      this.loadingAgentId = agentId;
      // Re-render the loading indicator with the correct agent
      const loading = document.getElementById('loading-indicator');
      if (loading) {
        loading.remove();
        const container = this.dom.messagesContainer;
        if (container) {
          this.appendLoadingIndicator(container);
          this.startAnimation('loading');
        }
      }
    }
  }

  // ==================== Message Grouping ====================

  /**
   * Group consecutive messages from the same sender
   * @param {Array} messages - Array of messages
   * @returns {Array} Array of message groups
   */
  groupMessages(messages) {
    const groups = [];
    let currentGroup = null;

    for (const msg of messages) {
      // Skip status messages
      if (msg.type === 'status' || msg.type === 'thinking') continue;

      // Determine if we should start a new group
      const shouldStartNewGroup = !currentGroup ||
        currentGroup.sender !== msg.sender ||
        currentGroup.senderId !== msg.senderId ||
        // Always separate user messages from agent messages
        (currentGroup.sender === 'user' && msg.sender !== 'user') ||
        (currentGroup.sender !== 'user' && msg.sender === 'user') ||
        // Separate tool_use messages into individual groups
        msg.type === 'tool_use' ||
        msg.type === 'permission_request' ||
        currentGroup.messages[0]?.type === 'tool_use' ||
        currentGroup.messages[0]?.type === 'permission_request';

      if (shouldStartNewGroup) {
        // Save current group if exists
        if (currentGroup) {
          groups.push(currentGroup);
        }
        // Start new group
        currentGroup = {
          sender: msg.sender,
          senderId: msg.senderId,
          senderName: msg.senderName,
          messages: [msg]
        };
      } else {
        // Add to current group
        currentGroup.messages.push(msg);
      }
    }

    // Don't forget the last group
    if (currentGroup) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * Render a message group
   * @param {Object} group - Message group with sender info and messages
   * @returns {string} HTML string
   */
  renderMessageGroup(group) {
    const { sender, senderId, senderName, messages } = group;
    const avatar = this.getMessageAvatar({ sender, senderId });

    // If only one message, render normally
    if (messages.length === 1) {
      return this.renderMessage(messages[0]);
    }

    // Render grouped messages
    const messagesHtml = messages.map((msg, index) => {
      const isLast = index === messages.length - 1;
      const contentHtml = this.formatContent(msg.content);

      // Skip empty messages
      if (!contentHtml && msg.type !== 'tool_use' && msg.type !== 'permission_request') {
        return '';
      }

      // Special rendering for tool_use
      if (msg.type === 'tool_use') {
        return this.renderToolUseMessage(msg);
      }

      // Special rendering for permission_request
      if (msg.type === 'permission_request' && msg.metadata?.permissionRequest) {
        return `<div class="message-content">${this.renderPermissionCard(msg.metadata.permissionRequest)}</div>`;
      }

      // Regular message content
      return `
        <div class="message-group-item">
          <div class="message-content">${contentHtml}</div>
          ${isLast ? `<span class="message-time-inline">${this.formatTime(msg.createdAt)}</span>` : ''}
        </div>
      `;
    }).filter(html => html.length > 0).join('');

    if (!messagesHtml) return '';

    return `
      <div class="message-group ${sender} ${senderId || ''}" data-sender-id="${senderId || ''}">
        <div class="message-group-header">
          <span class="message-avatar ${senderId || ''}">${avatar}</span>
          <span class="message-sender">${senderName}</span>
          <span class="message-time">${this.formatTime(messages[0].createdAt)}</span>
        </div>
        <div class="message-group-content">
          ${messagesHtml}
        </div>
      </div>
    `;
  }

  /**
   * Render a tool_use message (used in groups)
   */
  renderToolUseMessage(msg) {
    return this.toolManager.renderToolUseMessage(msg);
  }

  renderMessage(msg) {
    const avatar = this.getMessageAvatar(msg);
    const typeClass = msg.type || 'text';

    // Format content (may be empty for first streaming chunk)
    let contentHtml = this.formatContent(msg.content || '');

    // Special case: streaming messages should always render, even with empty content
    const isStreaming = msg.metadata?.isStreaming === true;

    // Skip messages with no content (except streaming, tool_use, permission_request)
    if (!contentHtml && !isStreaming && msg.type !== 'tool_use' && msg.type !== 'permission_request') {
      return '';
    }

    // Add typing cursor for streaming messages
    if (isStreaming) {
      contentHtml = contentHtml || '';
      contentHtml += '<span class="typing-cursor"></span>';
    }

    // Special rendering for tool_use
    if (msg.type === 'tool_use') {
      contentHtml = this.toolManager.renderToolCard(msg, { isGrouped: false });
    }

    // Special rendering for permission_request
    if (msg.type === 'permission_request' && msg.metadata?.permissionRequest) {
      contentHtml = this.renderPermissionCard(msg.metadata.permissionRequest);
    }

    return `
      <div class="message ${msg.sender} ${typeClass} ${msg.senderId || ''}" data-msg-id="${msg.id}">
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
    const container = this.dom.taskList;
    if (!container) return;

    if (this.tasks.length === 0) {
      this.renderEmptyState('task-list', 'tasks', '暂无任务', '创建新会话开始任务');
      return;
    }

    container.innerHTML = this.tasks.map(task => {
      const taskTitle = task.userPrompt ? task.userPrompt.substring(0, 50) + (task.userPrompt.length > 50 ? '...' : '') : '未命名任务';
      return `
      <div class="task-card" data-task-id="${task.id}">
        <div class="task-card-header">
          <div class="task-title">${this.escapeHtml(taskTitle)}</div>
          <span class="task-status ${task.status}">${this.getStatusText(task.status)}</span>
        </div>
        <div class="task-meta">
          <span>${task.sessionId?.substring(0, 8)}...</span>
          <span>${this.formatTime(task.createdAt)}</span>
          <span>${task.subtasks?.length || 0} 个子任务</span>
        </div>
      </div>
    `}).join('');
    // 事件委托在 initEventDelegation 中处理，无需单独绑定
  }

  renderScheduledTasks() {
    const container = this.dom.scheduledList;
    if (!container) return;

    if (this.scheduledTasks.length === 0) {
      this.renderEmptyState('scheduled-list', 'scheduled', '暂无定时任务', '点击右上角按钮创建定时任务');
      return;
    }

    const deleteIcon = getIcon('delete');
    const playIcon = `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;

    container.innerHTML = this.scheduledTasks.map(task => `
      <div class="schedule-card">
        <div class="schedule-header">
          <div class="schedule-title">${task.title}</div>
          <span class="task-status ${task.status}">${this.getStatusText(task.status)}</span>
        </div>
        <div class="schedule-description">${task.description || '无描述'}</div>
        <div class="task-meta" style="margin-bottom: 12px;">
          <span>${this.formatTime(task.nextRunAt)}</span>
          <span>${this.getRepeatText(task.repeat)}</span>
        </div>
        <div class="schedule-actions">
          <button class="btn btn-secondary btn-icon" onclick="app.runScheduledTask('${task.id}')">${playIcon} 执行</button>
          <button class="btn btn-danger btn-icon" onclick="app.deleteScheduledTask('${task.id}')">${deleteIcon} 删除</button>
        </div>
      </div>
    `).join('');
  }

  renderEmptyState(containerId, iconName, title, description) {
    // 对于已缓存的容器直接使用缓存
    const container = this.dom[containerId] || document.getElementById(containerId);
    if (!container) return;

    const icon = getIcon(iconName) || '';

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
      // Failed to load session
    }
  }

  async createSession() {
    const { sessionTitle, workingDirInput, newSessionModal } = this.dom;
    const title = sessionTitle?.value.trim() || '';
    const workingDir = workingDirInput?.value.trim() || '.';

    try {
      const session = await api.createSession({
        title: title || undefined,
        workingDirectory: workingDir,
      });

      this.sessions.unshift(session);
      this.renderSessions();
      this.selectSession(session.id);
      this.hideModal('new-session-modal');
      if (sessionTitle) sessionTitle.value = '';
    } catch (error) {
      this.showAlert('创建会话失败', '错误');
    }
  }

  async deleteSession(sessionId) {
    const confirmed = await this.showConfirm('确定要删除此会话吗？', '删除确认');
    if (!confirmed) return;

    try {
      await api.deleteSession(sessionId);
      this.sessions = this.sessions.filter(s => s.id !== sessionId);

      if (this.currentSession?.id === sessionId) {
        this.currentSession = null;
        this.updateChatHeader();
        this.dom.messagesContainer.innerHTML = `
          <div class="welcome-message">
            <h3>👑 欢迎使用 MonkAgents</h3>
            <p>唐太宗陛下，选择或创建一个会话开始与智能体协作</p>
          </div>
        `;
      }

      this.renderSessions();
    } catch (error) {
      this.showAlert('删除会话失败', '错误');
    }
  }

  updateChatHeader() {
    const { currentSessionTitle, workingDirectory } = this.dom;
    if (currentSessionTitle) {
      currentSessionTitle.textContent = this.currentSession?.title || '未命名会话';
    }
    if (workingDirectory) {
      if (this.currentSession?.workingDirectory) {
        workingDirectory.innerHTML = `${getIcon('browse')}<span>${this.currentSession.workingDirectory}</span>`;
      } else {
        workingDirectory.innerHTML = '';
      }
    }
  }

  updateSessionFilter() {
    const filter = this.dom.taskSessionFilter;
    if (!filter) return;

    filter.innerHTML = '<option value="">全部会话</option>' +
      this.sessions.map(s => `<option value="${s.id}">${s.title || '未命名会话'}</option>`).join('');
  }

  // ==================== Messaging ====================

  sendMessage() {
    // If generating, stop instead
    if (this.isGenerating) {
      this.stopGeneration();
      return;
    }

    const { messageInput } = this.dom;
    const content = messageInput?.value.trim() || '';

    if (!content) {
      return;
    }

    if (!this.currentSession) {
      this.showAlert('请先创建或选择一个会话', '提示');
      return;
    }

    // Clear input
    if (messageInput) messageInput.value = '';

    // Update button state (will be disabled since input is empty)
    this.updateSendButtonState();

    // Reset cancelled state for new task
    this.isCancelled = false;

    // Reset thinking state for new task
    this.isThinkingShowing = false;
    this.hideThinkingIndicator();

    // Set generating state
    this.setGeneratingState(true);

    // Create and add user message to DOM immediately
    const userMessage = {
      id: `temp-user-${Date.now()}`,
      sender: 'user',
      senderId: 'user',
      senderName: '唐太宗（我）',
      content: content,
      type: 'text',
      createdAt: new Date().toISOString(),
    };

    // Add to session messages
    if (!this.currentSession.messages) {
      this.currentSession.messages = [];
    }
    this.currentSession.messages.push(userMessage);

    // Append to DOM immediately
    this.appendMessageToDOM(userMessage);

    // Show loading indicator AFTER user message
    this.showLoadingIndicator();

    // Send via WebSocket
    wsClient.sendMessage(this.currentSession.id, content);
  }

  /**
   * Stop generation - cancel current task
   */
  stopGeneration() {
    if (!this.isGenerating) return;

    // Mark as cancelled FIRST to stop processing stream messages
    this.isCancelled = true;

    if (this.currentTaskId) {
      wsClient.cancelTask(this.currentTaskId);
    }

    // Reset state immediately (don't use setGeneratingState as it resets isCancelled)
    this.isGenerating = false;
    this.updateSendButtonState();
    this.hideLoadingIndicator();
    this.currentTaskId = null;
  }

  /**
   * Set generating state and update UI
   */
  setGeneratingState(isGenerating) {
    this.isGenerating = isGenerating;
    this.updateSendButtonState();

    // Reset cancelled state when generation completes
    if (!isGenerating) {
      this.isCancelled = false;
    }
  }

  /**
   * Update send button state based on input content and generation state
   */
  updateSendButtonState() {
    const { sendBtn, messageInput } = this.dom;

    if (!sendBtn) return;

    if (this.isGenerating) {
      // Generating: show stop button (enabled)
      sendBtn.classList.add('is-generating');
      sendBtn.disabled = false;
      sendBtn.dataset.tooltip = '停止生成';
    } else {
      // Not generating: show send button
      sendBtn.classList.remove('is-generating');

      // Disable if input is empty
      const content = messageInput?.value.trim() || '';
      sendBtn.disabled = content.length === 0;
      sendBtn.dataset.tooltip = content.length === 0 ? '请输入你的问题' : '发送';
    }
  }

  // ==================== Unified Animation System ====================

  /**
   * 开始动画（统一处理 loading 和 thinking）
   * @param {string} type - 'loading' 或 'thinking'
   */
  startAnimation(type) {
    this.stopAnimation(); // Clear any existing
    let dotCount = 0;
    this.animationInterval = setInterval(() => {
      const dots = document.querySelector(`#${type}-indicator .${type}-dots`);
      if (dots) {
        dotCount = (dotCount % 3) + 1;
        dots.textContent = '.'.repeat(dotCount);
      } else {
        // Element no longer exists, stop animation
        this.stopAnimation();
      }
    }, 500);
  }

  /**
   * 停止动画
   */
  stopAnimation() {
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
    }
  }

  // Loading indicator with animated dots
  showLoadingIndicator() {
    const container = this.dom.messagesContainer;
    if (!container) return;

    // Remove existing loading indicator if any
    this.hideLoadingIndicator();

    // Set loading flag
    this.isLoadingShowing = true;

    // Append loading indicator
    this.appendLoadingIndicator(container);

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;

    // Start animated dots
    this.startAnimation('loading');
  }

  hideLoadingIndicator() {
    this.isLoadingShowing = false;
    const loading = document.getElementById('loading-indicator');
    if (loading) {
      loading.remove();
    }
    // 只有当没有 thinking 时才停止动画
    if (!this.isThinkingShowing) {
      this.stopAnimation();
    }
  }

  // Thinking indicator - same simple style as loading indicator
  showThinkingIndicator(agentName) {
    // Already showing, don't recreate
    if (this.isThinkingShowing) return;

    const container = this.dom.messagesContainer;
    if (!container) return;

    // Use the same simple style as loading indicator
    const thinkingHtml = `
      <div class="thinking-indicator" id="thinking-indicator">
        <div class="thinking-spinner"></div>
        <span class="thinking-text">正在思考</span><span class="thinking-dots"></span>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', thinkingHtml);

    // Set state
    this.isThinkingShowing = true;

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;

    // Start animated dots
    this.startAnimation('thinking');
  }

  hideThinkingIndicator() {
    this.isThinkingShowing = false;
    const thinking = document.getElementById('thinking-indicator');
    if (thinking) {
      thinking.remove();
    }
    // 只有当没有 loading 时才停止动画
    if (!this.isLoadingShowing) {
      this.stopAnimation();
    }
  }

  addMessage(message) {
    if (!this.currentSession) return;

    // Ignore agent messages if task was cancelled (but allow user/system messages)
    if (this.isCancelled && message.sender === 'agent' && message.type !== 'error') {
      return;
    }

    if (!this.currentSession.messages) {
      this.currentSession.messages = [];
    }

    // Check for duplicate user message (we already added it optimistically)
    if (message.sender === 'user') {
      // Find and replace temp user message with server-confirmed one
      const tempIndex = this.currentSession.messages.findIndex(m =>
        m.sender === 'user' && m.id.startsWith('temp-user-')
      );
      if (tempIndex >= 0) {
        // Replace temp message with confirmed message (keep same content, update ID)
        this.currentSession.messages[tempIndex].id = message.id;
        // Update DOM data attribute
        const msgEl = document.querySelector(`[data-msg-id^="temp-user-"]`);
        if (msgEl) {
          msgEl.setAttribute('data-msg-id', message.id);
        }
        return; // Don't add duplicate
      }
    }

    // Hide loading indicator when first agent content arrives (not user message)
    // Note: Don't hide thinking indicator here - it's handled by thinking message logic
    if (message.sender === 'agent' && (message.type === 'text' || message.type === 'tool_use')) {
      this.hideLoadingIndicator();
      this.hideThinkingIndicator();
    }

    // Skip status messages - they are no longer displayed
    if (message.type === 'status') {
      return;
    }

    // Handle thinking status messages - show/hide "正在思考..." indicator
    if (message.type === 'thinking' && message.metadata?.isThinking) {
      if (message.metadata.isComplete) {
        // Thinking complete, hide the indicator
        this.hideThinkingIndicator();
      } else {
        // Thinking started, show the indicator
        this.showThinkingIndicator(message.senderName);
      }
      return; // Don't add thinking messages to the message list
    }

    // Check if this is a streaming message (ID starts with "stream-")
    const isStreaming = message.id && message.id.startsWith('stream-');
    const isStreamingChunk = message.metadata?.isStreaming === true;
    const isComplete = message.metadata?.isComplete === true;

    // Check if this is a tool_use message update
    const isToolUse = message.type === 'tool_use';
    const isToolUpdate = isToolUse && message.id && message.id.startsWith('tool-');

    // Handle tool_use message updates
    if (isToolUpdate) {
      const existingIndex = this.currentSession.messages.findIndex(m => m.id === message.id);

      if (existingIndex >= 0 && isComplete) {
        // Update existing tool_use message to mark it as complete
        const duration = message.metadata?.duration;
        const status = message.metadata?.status || ToolStatus.COMPLETED;
        const error = message.metadata?.error;

        this.currentSession.messages[existingIndex].metadata = {
          ...this.currentSession.messages[existingIndex].metadata,
          isComplete: true,
          status: status,
          duration: duration,
          result: message.metadata?.result,
          error: error
        };
        // Use ToolManager to update status (pass result for output display)
        this.toolManager.updateToolStatus(message.id, status, { duration, error, result: message.metadata?.result });
        return;
      } else if (!isComplete) {
        // New tool_use message (in progress)
        this.currentSession.messages.push(message);
        this.appendMessageToDOM(message);
        // Start timer for the new tool
        this.toolManager.startTimer(message.id);
        return;
      }
      return;
    }

    if (isStreaming) {
      const existingIndex = this.currentSession.messages.findIndex(m => m.id === message.id);
      const isFinal = message.metadata?.isFinal === true;

      if (isComplete) {
        // Streaming complete - update or create the final message
        if (isFinal && message.content) {
          if (existingIndex >= 0) {
            this.currentSession.messages[existingIndex].content = message.content;
            this.currentSession.messages[existingIndex].type = 'text';
            delete this.currentSession.messages[existingIndex].metadata?.isStreaming;
            delete this.currentSession.messages[existingIndex].metadata?.isComplete;
            delete this.currentSession.messages[existingIndex].metadata?.isFinal;
            // Update DOM with final content
            this.updateStreamingMessageDOM(message.id, message.content, true);
          } else {
            this.currentSession.messages.push({
              ...message,
              type: 'text',
            });
            this.appendMessageToDOM(this.currentSession.messages[this.currentSession.messages.length - 1]);
          }
        } else if (existingIndex >= 0) {
          this.currentSession.messages[existingIndex].type = 'text';
          delete this.currentSession.messages[existingIndex].metadata?.isStreaming;
          delete this.currentSession.messages[existingIndex].metadata?.isComplete;
          this.updateStreamingMessageDOM(message.id, this.currentSession.messages[existingIndex].content, true);
        }
      } else if (isStreamingChunk) {
        // This is a streaming chunk - append to existing or create new
        if (existingIndex >= 0) {
          // Append content to existing streaming message
          this.currentSession.messages[existingIndex].content += message.content;
          // Incremental DOM update - no re-render
          this.updateStreamingMessageDOM(message.id, this.currentSession.messages[existingIndex].content, false);
        } else {
          // First chunk of streaming message
          this.currentSession.messages.push({
            ...message,
            content: message.content,
            type: 'thinking',
          });
          this.appendMessageToDOM(this.currentSession.messages[this.currentSession.messages.length - 1]);
        }
      }
    } else {
      // Non-streaming message: check if it's an update or new message
      const existingIndex = this.currentSession.messages.findIndex(m => m.id === message.id);
      if (existingIndex >= 0) {
        // Update existing message (e.g., status update)
        this.currentSession.messages[existingIndex] = message;
      } else {
        // Add new message
        this.currentSession.messages.push(message);
        this.appendMessageToDOM(message);
      }
    }

    // Scroll to bottom
    const container = this.dom.messagesContainer;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }

    // Update session message count in sidebar
    this.updateSessionMessageCount(this.currentSession.id);
  }

  // ==================== Incremental DOM Updates ====================

  /**
   * Append a single message to DOM without re-rendering everything
   */
  appendMessageToDOM(message) {
    const container = this.dom.messagesContainer;
    if (!container) return;

    // Remove welcome message if present
    const welcome = container.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    // Remove existing message with same ID
    const existing = container.querySelector(`[data-msg-id="${message.id}"]`);
    if (existing) existing.remove();

    // Render and append
    const html = this.renderMessage(message);
    if (html) {
      container.insertAdjacentHTML('beforeend', html);
    }

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  /**
   * Update streaming message content directly in DOM
   */
  updateStreamingMessageDOM(messageId, content, isComplete) {
    const msgEl = document.querySelector(`[data-msg-id="${messageId}"] .message-content`);
    if (!msgEl) return;

    // Format content
    const formattedContent = this.formatContent(content);

    if (isComplete) {
      // Final update - replace content and remove cursor
      msgEl.innerHTML = formattedContent;
      msgEl.classList.remove('streaming');
    } else {
      // Streaming update - add cursor
      msgEl.innerHTML = formattedContent + '<span class="typing-cursor"></span>';
      msgEl.classList.add('streaming');
    }

    // Scroll to bottom
    const container = this.dom.messagesContainer;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  updateSessionMessageCount(sessionId) {
    const sessionItem = document.querySelector(`.session-item[data-session-id="${sessionId}"]`);
    if (sessionItem) {
      const metaEl = sessionItem.querySelector('.session-item-meta');
      if (metaEl && this.currentSession?.messages) {
        const count = this.currentSession.messages.filter(m => m.type !== 'status').length;
        const timeText = metaEl.innerHTML.split('·')[0];
        metaEl.innerHTML = `${timeText}· ${count} 条消息`;
      }
    }

    // Also update the session in the sessions array
    const session = this.sessions.find(s => s.id === sessionId);
    if (session && this.currentSession?.messages) {
      session.messageCount = this.currentSession.messages.filter(m => m.type !== 'status').length;
    }
  }

  finalizeStreamingMessages() {
    if (!this.currentSession?.messages) return;

    // Convert streaming message IDs to permanent IDs
    // This ensures next execution creates new messages
    this.currentSession.messages.forEach((msg, index) => {
      if (msg.id && msg.id.startsWith('stream-')) {
        msg.id = `msg-${Date.now()}-${index}`;
      }
    });
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
    const { scheduleTitle, scheduleDescription, scheduleTime, scheduleRepeat } = this.dom;
    const title = scheduleTitle?.value.trim() || '';
    const description = scheduleDescription?.value.trim() || '';
    const time = scheduleTime?.value || '';
    const repeat = scheduleRepeat?.value || 'once';

    if (!title || !time) {
      this.showAlert('请填写任务标题和执行时间', '提示');
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
      if (scheduleTitle) scheduleTitle.value = '';
      if (scheduleDescription) scheduleDescription.value = '';
    } catch (error) {
      this.showAlert('创建定时任务失败', '错误');
    }
  }

  async deleteScheduledTask(taskId) {
    const confirmed = await this.showConfirm('确定要删除此定时任务吗？', '删除确认');
    if (!confirmed) return;

    try {
      await api.request(`/api/scheduled-tasks/${taskId}`, { method: 'DELETE' });
      this.loadScheduledTasks();
    } catch (error) {
      // Failed to delete scheduled task
    }
  }

  async runScheduledTask(taskId) {
    try {
      await api.request(`/api/scheduled-tasks/${taskId}/run`, { method: 'POST' });
      this.showAlert('任务已触发执行', '成功');
    } catch (error) {
      this.showAlert('执行失败', '错误');
    }
  }

  // ==================== Task Detail ====================

  async showTaskDetail(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) {
      this.showAlert('任务不存在', '错误');
      return;
    }

    // Build task detail HTML
    const subtasksHtml = (task.subtasks || []).map((st, i) => `
      <div class="task-subtask" style="padding: 8px; background: var(--bg-color); border-radius: 4px; margin-bottom: 4px;">
        <span style="font-weight: 500;">${i + 1}. ${st.description?.substring(0, 50) || '子任务'}...</span>
        <span class="task-status ${st.status || 'pending'}" style="font-size: 0.7rem; margin-left: 8px;">
          ${this.getStatusText(st.status || 'pending')}
        </span>
      </div>
    `).join('');

    const content = `
      <div style="margin-bottom: 16px;">
        <strong>任务ID:</strong> ${task.id?.substring(0, 8)}...
      </div>
      <div style="margin-bottom: 16px;">
        <strong>状态:</strong>
        <span class="task-status ${task.status}">${this.getStatusText(task.status)}</span>
      </div>
      <div style="margin-bottom: 16px;">
        <strong>用户请求:</strong><br>
        ${this.escapeHtml(task.userPrompt || '无')}
      </div>
      <div style="margin-bottom: 16px;">
        <strong>创建时间:</strong> ${this.formatTime(task.createdAt)}
      </div>
      <div>
        <strong>子任务 (${task.subtasks?.length || 0}):</strong>
        <div style="margin-top: 8px;">
          ${subtasksHtml || '<p style="color: var(--text-muted);">无子任务</p>'}
        </div>
      </div>
    `;

    // Update modal content
    const { debugPage, debugContent } = this.dom;
    const modalContent = debugPage?.querySelector('.modal-content');
    if (modalContent) {
      const titleEl = modalContent.querySelector('h3');
      if (titleEl) titleEl.innerHTML = `<span style="width: 18px; height: 18px; display: inline-flex;">${getIcon('tasks')}</span> 任务详情`;
      if (debugContent) {
        debugContent.innerHTML = content;
      }
      this.showModal('debug-page');
    }
  }

  // ==================== Debug ====================

  async showDebugPage() {
    const taskId = this.currentSession?.currentTaskId;
    if (!taskId) {
      this.showAlert('当前没有正在执行的任务', '提示');
      return;
    }

    try {
      const debugInfo = await api.request(`/api/debug/${taskId}`);
      this.renderDebugInfo(debugInfo);
      this.showModal('debug-page');
    } catch (error) {
      this.showAlert('获取调试信息失败', '错误');
    }
  }

  renderDebugInfo(info) {
    const { debugContent } = this.dom;
    if (!debugContent) return;

    debugContent.innerHTML = `
      <div class="debug-section">
        <h3><span style="width: 18px; height: 18px; display: inline-flex;">${getIcon('info')}</span> 指标统计</h3>
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
      const { connectionStatus } = this.dom;
      if (connected) {
        connectionStatus.textContent = '已连接';
        connectionStatus.classList.remove('disconnected');
        connectionStatus.classList.add('connected');

        // Rejoin current session if any
        if (this.currentSession) {
          wsClient.join(this.currentSession.id);
        }
      } else {
        connectionStatus.textContent = '已断开';
        connectionStatus.classList.remove('connected');
        connectionStatus.classList.add('disconnected');
      }
    });

    wsClient.on('message', (message) => {
      // Handle chat_complete - finalize streaming messages
      if (message.type === 'chat_complete') {
        this.finalizeStreamingMessages();
        this.removeLastStatusMessage();
        this.setGeneratingState(false);
        this.currentTaskId = null;
        // Hide team status panel when chat is complete
        this.hideTeamStatusPanel();
        return;
      }

      // Ignore agent messages if cancelled
      if (this.isCancelled && message.sender === 'agent') {
        return;
      }

      this.addMessage(message);
    });

    wsClient.on('agent_status', ({ agentId, status, action }) => {
      // Ignore agent status if cancelled
      if (this.isCancelled) return;
      this.updateAgentStatus(agentId, status, action);
    });

    wsClient.on('task_status', ({ taskId, status, message }) => {
      this.updateTaskStatus(taskId, status, message);
    });

    wsClient.on('stream', (chunk) => {
      // Ignore stream if cancelled
      if (this.isCancelled) return;
      this.handleStreamChunk(chunk);
    });

    wsClient.on('error', (error) => {
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

    // Handle session history from Redis
    wsClient.on('session_history', ({ sessionId, messages, count }) => {
      // Only load history if this is the current session
      if (this.currentSession?.id === sessionId) {
        // Initialize messages array if needed
        if (!this.currentSession.messages) {
          this.currentSession.messages = [];
        }

        // Add history messages that aren't already in the session
        const existingIds = new Set(this.currentSession.messages.map(m => m.id));
        const newMessages = messages.filter(m => !existingIds.has(m.id));

        if (newMessages.length > 0) {
          // Prepend history messages
          this.currentSession.messages = [...newMessages, ...this.currentSession.messages];
          this.renderMessages();
        }
      }
    });

    // Handle permission request
    wsClient.on('permission_request', (request) => {
      this.handlePermissionRequest(request);
    });

    // Handle team status updates (multi-agent parallel execution)
    wsClient.on('team_status', (teamStatus) => {
      this.handleTeamStatus(teamStatus);
    });
  }

  // ==================== Permission Handling ====================

  /**
   * Handle permission request from server
   */
  handlePermissionRequest(request) {
    // Create permission card and add to messages
    const permissionMessage = {
      id: `permission-${request.id}`,
      sessionId: this.currentSession?.id,
      sender: 'system',
      senderId: 'system',
      senderName: '系统',
      type: 'permission_request',
      content: '',
      metadata: { permissionRequest: request },
      createdAt: new Date(),
    };

    this.addMessage(permissionMessage);
  }

  /**
   * Handle team status updates (multi-agent parallel execution)
   * Updates agent status indicators for all team members
   */
  handleTeamStatus(teamStatus) {
    // Update status for each team member
    if (teamStatus.members) {
      for (const member of teamStatus.members) {
        const status = member.status === 'working' ? 'executing' :
                       member.status === 'idle' ? 'idle' : 'offline';
        this.updateAgentStatus(member.agentId, status,
          member.currentTaskId ? `Working on task` : undefined);
      }
    }

    // Store team status for UI display
    if (!this.teamStatuses) {
      this.teamStatuses = new Map();
    }
    this.teamStatuses.set(teamStatus.teamId, teamStatus);

    // Render team status panel
    this.renderTeamStatusPanel(teamStatus);
  }

  /**
   * Render the team status panel
   */
  renderTeamStatusPanel(teamStatus) {
    const panel = this.dom.teamStatusPanel;
    const badge = this.dom.teamStatusBadge;
    const membersList = this.dom.teamMembersList;

    if (!panel || !badge || !membersList) return;

    // Show the panel
    panel.classList.remove('hidden');

    // Update badge
    const statusLabels = {
      active: '执行中',
      completed: '已完成',
      cancelled: '已取消',
      error: '错误'
    };
    badge.textContent = statusLabels[teamStatus.status] || teamStatus.status;
    badge.className = 'team-status-badge ' + teamStatus.status;

    // Agent avatar mapping
    const agentAvatars = {
      wukong: { emoji: '🐵', name: '孙悟空', class: 'wukong' },
      bajie: { emoji: '🐷', name: '猪八戒', class: 'bajie' },
      shaseng: { emoji: '🧔', name: '沙和尚', class: 'shaseng' },
      rulai: { emoji: '🙏', name: '如来佛祖', class: 'rulai' },
      tangseng: { emoji: '🧘', name: '唐僧', class: 'tangseng' },
    };

    // Render members
    membersList.innerHTML = '';
    if (teamStatus.members) {
      for (const member of teamStatus.members) {
        const agentInfo = agentAvatars[member.agentId] || { emoji: '🤖', name: member.agentName || member.agentId, class: '' };
        const statusText = member.status === 'working' ? '执行中...' :
                          member.status === 'idle' ? '空闲' : '离线';

        const memberEl = document.createElement('div');
        memberEl.className = `team-member-item ${member.status}`;
        memberEl.innerHTML = `
          <div class="team-member-avatar ${agentInfo.class}">
            <span>${agentInfo.emoji}</span>
          </div>
          <div class="team-member-info">
            <div class="team-member-name">${agentInfo.name}</div>
            <div class="team-member-status ${member.status}">${statusText}</div>
            ${member.tasksCompleted > 0 ? `<div class="team-member-tasks">已完成 ${member.tasksCompleted} 个任务</div>` : ''}
          </div>
          <div class="team-member-indicator ${member.status}"></div>
        `;
        membersList.appendChild(memberEl);
      }
    }
  }

  /**
   * Hide the team status panel
   */
  hideTeamStatusPanel() {
    const panel = this.dom.teamStatusPanel;
    if (panel) {
      panel.classList.add('hidden');
    }
  }

  /**
   * Render permission request card
   */
  renderPermissionCard(request) {
    const riskLabels = {
      low: '🟢 低风险',
      medium: '🟡 中风险',
      high: '🔴 高风险'
    };

    const toolIcons = {
      Bash: '⌨️',
      Read: '📖',
      Write: '✏️',
      Edit: '📝',
      Glob: '🔍',
      Grep: '🔎',
      WebFetch: '🌐',
      WebSearch: '🔍',
      Agent: '🤖',
    };

    const icon = toolIcons[request.toolName] || '🔧';

    return `
      <div class="permission-card" data-request-id="${request.id}">
        <div class="permission-header">
          <span class="permission-agent">${request.agentName}</span>
          <span class="permission-risk risk-${request.risk}">
            ${riskLabels[request.risk] || '⚠️ 未知风险'}
          </span>
        </div>

        <div class="permission-body">
          <div class="permission-tool">
            <span class="tool-icon">${icon}</span>
            <span class="tool-name">${request.toolName}</span>
          </div>

          <div class="permission-detail">
            ${this.renderToolDetail(request)}
          </div>
        </div>

        <div class="permission-actions">
          <button class="btn btn-success btn-allow" onclick="app.handlePermissionAllow('${request.id}')">
            ✓ 允许
          </button>
          <button class="btn btn-danger btn-deny" onclick="app.handlePermissionDeny('${request.id}')">
            ✗ 拒绝
          </button>
          <label class="remember-checkbox">
            <input type="checkbox" id="remember-${request.id}">
            记住此决定
          </label>
        </div>
      </div>
    `;
  }

  /**
   * Render tool detail based on tool type
   */
  renderToolDetail(request) {
    const input = request.input || {};

    switch (request.toolName) {
      case 'Bash':
        return `
          <div class="command-preview">
            <code>${this.escapeHtml(input.command || '')}</code>
          </div>
          ${input.description ? `<p class="command-desc">${this.escapeHtml(input.description)}</p>` : ''}
        `;

      case 'Write':
      case 'Edit':
        return `
          <div class="file-path">
            📄 ${this.escapeHtml(input.file_path || '')}
          </div>
          ${request.toolName === 'Edit' ? `
            <div class="edit-preview">
              <div class="old-content">
                <span class="label">原内容:</span>
                <code>${this.escapeHtml(this.truncate(input.old_string || '', 100))}</code>
              </div>
              <div class="new-content">
                <span class="label">新内容:</span>
                <code>${this.escapeHtml(this.truncate(input.new_string || '', 100))}</code>
              </div>
            </div>
          ` : `
            <div class="write-preview">
              <span class="label">创建新文件</span>
            </div>
          `}
        `;

      case 'WebFetch':
        return `
          <div class="network-request">
            🌐 ${this.escapeHtml(input.url || '')}
          </div>
          ${input.prompt ? `<p class="fetch-prompt">${this.escapeHtml(input.prompt)}</p>` : ''}
        `;

      case 'WebSearch':
        return `
          <div class="search-query">
            🔍 ${this.escapeHtml(input.query || '')}
          </div>
        `;

      case 'Agent':
        return `
          <div class="agent-call">
            🤖 调用智能体: ${this.escapeHtml(input.agent_id || input.name || '未知')}
          </div>
          ${input.prompt ? `<p class="agent-prompt">${this.escapeHtml(this.truncate(input.prompt, 100))}</p>` : ''}
        `;

      default:
        if (input.file_path) {
          return `<div class="file-path">📄 ${this.escapeHtml(input.file_path)}</div>`;
        }
        return `<pre>${this.escapeHtml(JSON.stringify(input, null, 2))}</pre>`;
    }
  }

  /**
   * Handle permission allow
   */
  handlePermissionAllow(requestId) {
    const rememberEl = document.getElementById(`remember-${requestId}`);
    const remember = rememberEl ? rememberEl.checked : false;

    wsClient.sendPermissionResponse(requestId, 'allow', remember);

    // Remove the permission card
    this.removePermissionCard(requestId);
  }

  /**
   * Handle permission deny
   */
  handlePermissionDeny(requestId) {
    const rememberEl = document.getElementById(`remember-${requestId}`);
    const remember = rememberEl ? rememberEl.checked : false;

    wsClient.sendPermissionResponse(requestId, 'deny', remember);

    // Remove the permission card
    this.removePermissionCard(requestId);
  }

  /**
   * Remove permission card from UI
   */
  removePermissionCard(requestId) {
    // Remove from messages array
    if (this.currentSession?.messages) {
      const index = this.currentSession.messages.findIndex(
        m => m.id === `permission-${requestId}`
      );
      if (index > -1) {
        this.currentSession.messages.splice(index, 1);
        this.renderMessages();
      }
    }
  }

  /**
   * Truncate string
   */
  truncate(str, maxLength) {
    if (!str) return '';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
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
    // Track current task ID
    if (status === 'thinking' || status === 'executing') {
      this.currentTaskId = taskId;
    }

    // Update task card on tasks page
    const taskCard = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
    if (taskCard) {
      const statusEl = taskCard.querySelector('.task-status');
      if (statusEl) {
        statusEl.className = `task-status ${status}`;
        statusEl.textContent = this.getStatusText(status);
      }
    }

    // Update local tasks array
    const task = this.tasks.find(t => t.id === taskId);
    if (task) {
      task.status = status;
    }

    // If task completed, failed, or cancelled, reset generating state
    if (status === 'completed' || status === 'failed') {
      this.setGeneratingState(false);
      this.currentTaskId = null;
      this.removeLastStatusMessage();
      // 任务完成不再显示系统提示消息
    }
  }

  handleStreamChunk(chunk) {
    // Ignore stream chunks if task was cancelled
    if (this.isCancelled) {
      return;
    }

    // Handle streaming output
    if (chunk.eventType === 'text' && chunk.content) {
      // Find existing streaming message or create new one
      const streamId = `stream-${chunk.agentId || 'unknown'}`;

      if (!this.currentSession?.messages) {
        this.currentSession.messages = [];
      }

      // Find existing streaming message
      let streamMsg = this.currentSession.messages.find(m => m.id === streamId);

      if (streamMsg) {
        // Append content to existing message
        streamMsg.content += chunk.content;
        // 使用增量 DOM 更新，而不是完全重新渲染
        this.updateStreamingMessageDOM(streamId, streamMsg.content, false);
      } else {
        // Create new streaming message
        streamMsg = {
          id: streamId,
          sessionId: this.currentSession?.id,
          sender: 'agent',
          senderId: chunk.agentId || 'unknown',
          senderName: this.getAgentName(chunk.agentId) || '智能体',
          type: 'text',
          content: chunk.content,
          metadata: { isStreaming: true },
          createdAt: new Date(),
        };
        this.currentSession.messages.push(streamMsg);
        // 对于新消息，使用增量添加
        this.appendMessageToDOM(streamMsg);
      }

      // Scroll to bottom
      const container = this.dom.messagesContainer;
      if (container) {
        container.scrollTop = container.scrollHeight;
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

  // ==================== Custom Dialog ====================

  /**
   * Show a custom alert dialog
   * @param {string} message - Message to display
   * @param {string} title - Dialog title (optional)
   */
  async showAlert(message, title = '提示') {
    return new Promise((resolve) => {
      const { customDialogModal, dialogTitle, dialogMessage, dialogConfirmBtn, dialogCancelBtn } = this.dom;

      if (!customDialogModal) return resolve(false);

      dialogTitle.textContent = title;
      dialogMessage.textContent = message;
      dialogCancelBtn.classList.add('hidden');
      dialogConfirmBtn.textContent = '确定';

      const handleConfirm = () => {
        this.hideModal('custom-dialog-modal');
        dialogConfirmBtn.removeEventListener('click', handleConfirm);
        resolve(true);
      };

      dialogConfirmBtn.addEventListener('click', handleConfirm);
      this.showModal('custom-dialog-modal');
    });
  }

  /**
   * Show a custom confirm dialog
   * @param {string} message - Message to display
   * @param {string} title - Dialog title (optional)
   * @returns {Promise<boolean>} - True if confirmed, false if cancelled
   */
  async showConfirm(message, title = '确认') {
    return new Promise((resolve) => {
      const { customDialogModal, dialogTitle, dialogMessage, dialogConfirmBtn, dialogCancelBtn } = this.dom;

      if (!customDialogModal) return resolve(false);

      dialogTitle.textContent = title;
      dialogMessage.textContent = message;
      dialogCancelBtn.classList.remove('hidden');
      dialogConfirmBtn.textContent = '确定';
      dialogCancelBtn.textContent = '取消';

      const handleConfirm = () => {
        this.hideModal('custom-dialog-modal');
        dialogConfirmBtn.removeEventListener('click', handleConfirm);
        dialogCancelBtn.removeEventListener('click', handleCancel);
        resolve(true);
      };

      const handleCancel = () => {
        this.hideModal('custom-dialog-modal');
        dialogConfirmBtn.removeEventListener('click', handleConfirm);
        dialogCancelBtn.removeEventListener('click', handleCancel);
        resolve(false);
      };

      dialogConfirmBtn.addEventListener('click', handleConfirm);
      dialogCancelBtn.addEventListener('click', handleCancel);
      this.showModal('custom-dialog-modal');
    });
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
    if (msg.sender === 'user') {
      return `<img src="${this.getUserAvatar()}" alt="唐太宗" class="avatar-img" />`;
    }
    if (msg.sender === 'system') return '⚙';

    // Use SVG avatar for agents
    const agent = this.agents.find(a => a.id === msg.senderId);
    if (agent) {
      const avatarSrc = this.getAgentAvatar(msg.senderId);
      if (avatarSrc) {
        return `<img src="${avatarSrc}" alt="${agent.config.name}" class="avatar-img" />`;
      }
      return agent.config.emoji || '🤖';
    }
    return '🤖';
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
      thinking: '进行中',
      executing: '进行中',
      offline: '离线',
      pending: '进行中',
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

    // Remove execution_summary blocks before rendering (internal use only)
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

    if (!cleaned) return '';

    // Use marked.js for markdown rendering if available (已在 initMarked 中配置)
    if (typeof marked !== 'undefined') {
      try {
        return marked.parse(cleaned);
      } catch (e) {
        // Fall through to basic formatting
      }
    }

    // Fallback: basic markdown-like formatting
    let formatted = this.escapeHtml(cleaned);

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

  /**
   * HTML 转义 - 使用字符串替换避免创建临时 DOM 元素
   */
  escapeHtml(text) {
    if (!text) return '';
    const htmlEscapes = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return String(text).replace(/[&<>"']/g, char => htmlEscapes[char]);
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

  // ==================== Mention Menu ====================

  initMentionMenu() {
    const { messageInput, mentionMenu } = this.dom;

    if (!messageInput || !mentionMenu) return;

    messageInput.addEventListener('input', (e) => {
      this.handleMentionInput(e);
    });

    messageInput.addEventListener('keydown', (e) => {
      if (this.mentionMenuVisible) {
        this.handleMentionKeydown(e);
      }
    });

    // Close mention menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.input-container')) {
        this.hideMentionMenu();
      }
    });
  }

  handleMentionInput(e) {
    const input = e.target;
    const value = input.value;
    const cursorPos = input.selectionStart;

    // Find @ symbol before cursor
    let atIndex = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      if (value[i] === '@') {
        atIndex = i;
        break;
      }
      if (value[i] === ' ' || value[i] === '\n') {
        break;
      }
    }

    if (atIndex !== -1 && atIndex < cursorPos) {
      this.mentionStartIndex = atIndex;
      this.mentionQuery = value.substring(atIndex + 1, cursorPos).toLowerCase();
      this.showMentionMenu();
    } else {
      this.hideMentionMenu();
    }
  }

  handleMentionKeydown(e) {
    const mentionList = document.querySelector('.mention-menu-list');
    const items = mentionList?.querySelectorAll('.mention-item');

    if (!items || items.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectedMentionIndex = (this.selectedMentionIndex + 1) % items.length;
        this.updateMentionSelection(items);
        break;

      case 'ArrowUp':
        e.preventDefault();
        this.selectedMentionIndex = (this.selectedMentionIndex - 1 + items.length) % items.length;
        this.updateMentionSelection(items);
        break;

      case 'Enter':
      case 'Tab':
        e.preventDefault();
        this.selectMentionItem(items[this.selectedMentionIndex]);
        break;

      case 'Escape':
        e.preventDefault();
        this.hideMentionMenu();
        break;
    }
  }

  showMentionMenu() {
    const { mentionMenu } = this.dom;
    const mentionList = mentionMenu?.querySelector('.mention-menu-list');

    if (!mentionMenu || !mentionList) return;

    // Filter agents based on query
    const filteredAgents = this.agents.filter(agent => {
      const name = agent.config?.name?.toLowerCase() || '';
      const id = agent.id?.toLowerCase() || '';
      const query = this.mentionQuery.toLowerCase();
      return name.includes(query) || id.includes(query);
    });

    if (filteredAgents.length === 0) {
      this.hideMentionMenu();
      return;
    }

    // Render menu items
    mentionList.innerHTML = filteredAgents.map((agent, index) => {
      const avatarSrc = this.getAgentAvatar(agent.id);
      return `
        <div class="mention-item ${index === 0 ? 'selected' : ''}" data-agent-id="${agent.id}">
          <span class="mention-item-avatar">
            ${avatarSrc
              ? `<img src="${avatarSrc}" alt="${agent.config?.name}" class="avatar-img" />`
              : agent.config?.emoji || '🤖'
            }
          </span>
          <div class="mention-item-info">
            <div class="mention-item-name">${agent.config?.name || agent.id}</div>
            <div class="mention-item-role">${this.getRoleName(agent.config?.role)}</div>
          </div>
        </div>
      `;
    }).join('');

    // Bind click events
    mentionList.querySelectorAll('.mention-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectMentionItem(item);
      });
    });

    this.selectedMentionIndex = 0;
    this.mentionMenuVisible = true;
    mentionMenu.classList.remove('hidden');
  }

  hideMentionMenu() {
    const { mentionMenu } = this.dom;
    if (mentionMenu) {
      mentionMenu.classList.add('hidden');
    }
    this.mentionMenuVisible = false;
    this.mentionStartIndex = -1;
    this.mentionQuery = '';
  }

  updateMentionSelection(items) {
    items.forEach((item, index) => {
      item.classList.toggle('selected', index === this.selectedMentionIndex);
    });

    // Scroll selected item into view
    const selectedItem = items[this.selectedMentionIndex];
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest' });
    }
  }

  selectMentionItem(item) {
    if (!item) return;

    const agentId = item.dataset.agentId;
    const agent = this.agents.find(a => a.id === agentId);
    const agentName = agent?.config?.name || agentId;

    const { messageInput } = this.dom;
    const value = messageInput?.value || '';

    // Replace @query with @agentName
    const beforeMention = value.substring(0, this.mentionStartIndex);
    const afterCursor = value.substring(messageInput.selectionStart);

    messageInput.value = beforeMention + `@${agentName} ` + afterCursor;

    // Set cursor position after the mention
    const newPos = beforeMention.length + agentName.length + 2;
    messageInput.setSelectionRange(newPos, newPos);
    messageInput.focus();

    this.hideMentionMenu();
  }

  // ==================== Random Title Generation ====================

  async generateRandomTitle() {
    const { sessionTitle } = this.dom;
    const randomBtn = document.getElementById('random-title-btn');

    if (!sessionTitle || !randomBtn) return;

    // Show loading state
    randomBtn.disabled = true;
    randomBtn.textContent = '⏳';

    try {
      const response = await api.request('/utils/random-title', {
        method: 'POST',
      });

      if (response && response.title) {
        sessionTitle.value = response.title;
      }
    } catch (error) {
      // Fallback: use a preset title from 西游记
      const fallbackTitles = [
        '三打白骨精',
        '大闹天宫',
        '真假美猴王',
        '三借芭蕉扇',
        '偷吃人参果',
        '智取红孩儿',
        '流沙河收沙僧',
        '高老庄收八戒',
        '女儿国奇遇',
        '火焰山受阻',
        '通天河遇鼋',
        '狮驼岭斗妖',
        '盘丝洞遇险',
        '无底洞降鼠',
        '比丘国救儿',
      ];
      const randomTitle = fallbackTitles[Math.floor(Math.random() * fallbackTitles.length)];
      sessionTitle.value = randomTitle;
    } finally {
      randomBtn.disabled = false;
      randomBtn.textContent = '🎲';
    }
  }

  // ==================== Directory Browser ====================

  async showDirectoryBrowser() {
    const { workingDirInput } = this.dom;
    const currentPath = workingDirInput?.value || '';

    // Create modal for directory browsing
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 600px; width: 90%;">
        <div class="modal-header">
          <h3 style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-flex;">${getIcon('browse')}</span>
            选择工作目录
          </h3>
          <button class="btn btn-icon modal-close-btn">${getIcon('close')}</button>
        </div>
        <div style="margin-bottom: 16px;">
          <div style="display: flex; gap: 8px; margin-bottom: 8px;">
            <input type="text" id="dir-path-input" placeholder="输入路径" value="${currentPath}">
            <button id="dir-go-btn" class="btn btn-secondary">转到</button>
          </div>
          <div id="dir-list" style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: var(--radius-md);">
            <div style="padding: 20px; text-align: center; color: var(--on-surface-muted);">加载中...</div>
          </div>
        </div>
        <div class="modal-actions">
          <button id="dir-cancel-btn" class="btn btn-secondary">取消</button>
          <button id="dir-select-btn" class="btn btn-primary">选择当前目录</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const dirList = modal.querySelector('#dir-list');
    const pathInput = modal.querySelector('#dir-path-input');
    let selectedPath = currentPath;

    // Load directory listing
    const loadDirectory = async (path) => {
      try {
        const response = await api.request(`/debug/fs/browse?path=${encodeURIComponent(path)}`);
        selectedPath = response.currentPath;
        pathInput.value = selectedPath;

        let html = '';
        if (response.error) {
          html = `<div style="padding: 20px; text-align: center; color: var(--status-error);">${response.error}</div>`;
        } else {
          if (response.parentPath) {
            html += `<div class="dir-item" data-path="${response.parentPath}" style="padding: 8px; cursor: pointer; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 8px;">
              <span style="display: inline-flex; color: var(--on-surface-muted);">${getIcon('browse')}</span>
              <span style="color: var(--on-surface-muted);">..</span>
            </div>`;
          }
          if (response.directories.length === 0) {
            html += `<div style="padding: 20px; text-align: center; color: var(--on-surface-muted);">空目录</div>`;
          } else {
            for (const dir of response.directories) {
              html += `<div class="dir-item" data-path="${dir.path}" style="padding: 8px; cursor: pointer; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-flex; color: var(--color-primary-500);">${getIcon('browse')}</span>
                <span>${dir.name}</span>
              </div>`;
            }
          }
        }
        dirList.innerHTML = html;

        // Add click handlers
        dirList.querySelectorAll('.dir-item').forEach(item => {
          item.addEventListener('click', () => {
            loadDirectory(item.dataset.path);
          });
          item.addEventListener('mouseenter', () => {
            item.style.backgroundColor = 'var(--surface-tertiary)';
          });
          item.addEventListener('mouseleave', () => {
            item.style.backgroundColor = '';
          });
        });
      } catch (error) {
        dirList.innerHTML = `<div style="padding: 20px; text-align: center; color: #d32f2f;">加载失败: ${error.message}</div>`;
      }
    };

    // Event handlers
    modal.querySelector('.modal-close-btn').addEventListener('click', () => {
      modal.remove();
    });

    modal.querySelector('#dir-cancel-btn').addEventListener('click', () => {
      modal.remove();
    });

    modal.querySelector('#dir-select-btn').addEventListener('click', () => {
      if (workingDirInput) {
        workingDirInput.value = selectedPath;
      }
      modal.remove();
    });

    modal.querySelector('#dir-go-btn').addEventListener('click', () => {
      loadDirectory(pathInput.value);
    });

    pathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        loadDirectory(pathInput.value);
      }
    });

    // Close on outside click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    // Load initial directory
    loadDirectory(currentPath);
  }

  // ==================== Auto Select Recent Session ====================

  autoSelectRecentSession() {
    if (this.sessions && this.sessions.length > 0) {
      // Sessions are already sorted by createdAt desc
      // Select the most recent one
      const mostRecentSession = this.sessions[0];
      this.selectSession(mostRecentSession.id);
    }
  }
}

// Initialize app
const app = new App();
window.app = app; // Expose for inline onclick handlers

export default app;