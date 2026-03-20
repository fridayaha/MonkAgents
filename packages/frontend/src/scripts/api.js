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
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const api = {
  // Health check
  async health() {
    return request('/health');
  },

  // Sessions
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

  async deleteSession(id) {
    return request(`/sessions/${id}`, {
      method: 'DELETE',
    });
  },

  // Agents
  async getAgents() {
    return request('/agents');
  },

  async getAgent(id) {
    return request(`/agents/${id}`);
  },
};

export default api;