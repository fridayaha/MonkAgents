class WebSocketClient {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connect(sessionId) {
    if (this.socket) {
      this.disconnect();
    }

    this.socket = io('/', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.emit('connection', { connected: true });

      if (sessionId) {
        this.join(sessionId);
      }
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      this.emit('connection', { connected: false });
      this.attemptReconnect();
    });

    // Set up event listeners
    this.socket.on('message', (data) => {
      this.emit('message', data);
    });

    this.socket.on('agent_status', (data) => {
      this.emit('agent_status', data);
    });

    this.socket.on('task_status', (data) => {
      this.emit('task_status', data);
    });

    this.socket.on('stream', (data) => {
      this.emit('stream', data);
    });

    this.socket.on('error', (data) => {
      this.emit('error', data);
    });

    // Handle session history from Redis
    this.socket.on('session_history', (data) => {
      this.emit('session_history', data);
    });

    // Handle permission request
    this.socket.on('permission_request', (data) => {
      this.emit('permission_request', data);
    });

    // Handle team status updates
    this.socket.on('team_status', (data) => {
      this.emit('team_status', data);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        if (!this.connected) {
          this.connect();
        }
      }, 2000 * this.reconnectAttempts);
    }
  }

  join(sessionId) {
    if (this.socket && this.connected) {
      this.socket.emit('join', sessionId);
    }
  }

  leave(sessionId) {
    if (this.socket && this.connected) {
      this.socket.emit('leave', sessionId);
    }
  }

  sendMessage(sessionId, content) {
    if (this.socket && this.connected) {
      this.socket.emit('message', { sessionId, content });
    }
  }

  cancelTask(taskId) {
    if (this.socket && this.connected) {
      this.socket.emit('cancel', taskId);
    }
  }

  /**
   * Send permission response to server
   * @param {string} requestId - The permission request ID
   * @param {string} action - 'allow' or 'deny'
   * @param {boolean} remember - Whether to remember this decision
   * @param {string} reason - Optional reason for denial
   */
  sendPermissionResponse(requestId, action, remember = false, reason = null) {
    if (this.socket && this.connected) {
      this.socket.emit('permission_response', {
        requestId,
        action,
        remember,
        reason
      });
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => callback(data));
    }
  }

  isConnected() {
    return this.connected;
  }
}

export const wsClient = new WebSocketClient();
export default wsClient;