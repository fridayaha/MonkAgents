const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = new Error(`API Error: ${response.status} ${response.statusText}`);
    try {
      const body = await response.json();
      error.message = body.message || error.message;
    } catch {
      // Ignore JSON parse errors
    }
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const api = {
  // Export request for custom calls
  request,

  // Health check
  async health() {
    return request('/health');
  },

  // ==================== Sessions ====================

  async getSessions() {
    return request('/sessions');
  },

  async getSession(id) {
    return request(`/sessions/${id}`);
  },

  async createSession(data) {
    return request('/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateSession(id, data) {
    return request(`/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteSession(id) {
    return request(`/sessions/${id}`, {
      method: 'DELETE',
    });
  },

  // ==================== Agents ====================

  async getAgents() {
    return request('/agents');
  },

  async getAgent(id) {
    return request(`/agents/${id}`);
  },

  // ==================== Tasks ====================

  async getTasks(params = {}) {
    const query = new URLSearchParams(params).toString();
    const endpoint = query ? `/tasks?${query}` : '/tasks';
    return request(endpoint);
  },

  async getTask(id) {
    return request(`/tasks/${id}`);
  },

  async cancelTask(id) {
    return request(`/tasks/${id}/cancel`, {
      method: 'POST',
    });
  },

  async retryTask(id) {
    return request(`/tasks/${id}/retry`, {
      method: 'POST',
    });
  },

  // ==================== Scheduled Tasks ====================

  async getScheduledTasks() {
    return request('/scheduled-tasks');
  },

  async createScheduledTask(data) {
    return request('/scheduled-tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deleteScheduledTask(id) {
    return request(`/scheduled-tasks/${id}`, {
      method: 'DELETE',
    });
  },

  async runScheduledTask(id) {
    return request(`/scheduled-tasks/${id}/run`, {
      method: 'POST',
    });
  },

  // ==================== Debug ====================

  async getDebugInfo(taskId) {
    return request(`/debug/${taskId}`);
  },
};

export default api;