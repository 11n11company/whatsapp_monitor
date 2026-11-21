import axios from 'axios';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD
    ? 'https://whatsappmonitor-production.up.railway.app/api'
    : '/api');

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 20000,
});

// Request interceptor to attach JWT token to all outgoing requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('wm_auth_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to catch 401 Unauthorized errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear expired credentials and notify listeners
      localStorage.removeItem('wm_auth_token');
      localStorage.removeItem('wm_user_data');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login?expired=1';
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: async (credentials) => {
    const res = await api.post('/auth/login', credentials);
    return res.data;
  },
  getMe: async () => {
    const res = await api.get('/auth/me');
    return res.data;
  },
  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Silently catch network failures during logout
    } finally {
      localStorage.removeItem('wm_auth_token');
      localStorage.removeItem('wm_user_data');
    }
  },
};

export const salespersonsAPI = {
  getAll: async (params = {}) => {
    const res = await api.get('/salespersons', { params });
    return res.data;
  },
  getById: async (id) => {
    const res = await api.get(`/salespersons/${id}`);
    return res.data;
  },
  create: async (data) => {
    const res = await api.post('/salespersons', data);
    return res.data;
  },
  update: async (id, data) => {
    const res = await api.patch(`/salespersons/${id}`, data);
    return res.data;
  },
  delete: async (id) => {
    const res = await api.delete(`/salespersons/${id}`);
    return res.data;
  },
  purge: async (id) => {
    const res = await api.delete(`/salespersons/${id}?purge=true`);
    return res.data;
  },
  getCustomerConversation: async (salespersonId, customerId) => {
    const res = await api.get(`/salespersons/${salespersonId}/customers/${customerId}/conversation`);
    return res.data;
  },
};

export const whatsappAPI = {
  connect: async (salespersonId) => {
    const res = await api.post(`/whatsapp/connect/${salespersonId}`);
    return res.data;
  },
  getStatus: async (salespersonId) => {
    const res = await api.get(`/whatsapp/status/${salespersonId}`);
    return res.data;
  },
  getSyncStatus: async (salespersonId) => {
    const res = await api.get(`/whatsapp/sync-status/${salespersonId}`);
    return res.data;
  },
  getQR: async (salespersonId) => {
    const res = await api.get(`/whatsapp/qr/${salespersonId}`);
    return res.data;
  },
  refreshQR: async (salespersonId) => {
    const res = await api.post(`/whatsapp/refresh-qr/${salespersonId}`);
    return res.data;
  },
  disconnect: async (salespersonId) => {
    const res = await api.post(`/whatsapp/disconnect/${salespersonId}`);
    return res.data;
  },
  getStreamTicket: async () => {
    const res = await api.post('/whatsapp/live-stream/ticket');
    return res.data;
  },
  getLiveStreamUrl: (ticket = null) => {
    if (ticket) {
      return `${API_BASE_URL}/whatsapp/live-stream?ticket=${encodeURIComponent(ticket)}`;
    }
    // Fallback if ticket not supplied
    return `${API_BASE_URL}/whatsapp/live-stream`;
  },
};

export const mediaAPI = {
  getTicket: async (mediaId) => {
    const res = await api.post(`/media/${mediaId}/ticket`);
    return res.data;
  },
  getUrl: (mediaId, ticket = null) => {
    if (ticket) {
      return `${API_BASE_URL}/media/${mediaId}?ticket=${encodeURIComponent(ticket)}`;
    }
    return `${API_BASE_URL}/media/${mediaId}`;
  },
  download: async (mediaId) => {
    const res = await api.get(`/media/${mediaId}`, { responseType: 'blob' });
    return res.data;
  },
};

export const healthAPI = {
  check: async () => {
    const res = await api.get('/health');
    return res.data;
  },
};

export const customersAPI = {
  getBySalesperson: async (salespersonId, params = {}) => {
    const res = await api.get(`/salespersons/${salespersonId}/customers`, { params });
    return res.data;
  },
  getById: async (customerId) => {
    const res = await api.get(`/customers/${customerId}`);
    return res.data;
  },
  getConversations: async (customerId) => {
    const res = await api.get(`/customers/${customerId}/conversations`);
    return res.data;
  },
};

export const conversationsAPI = {
  getMessages: async (conversationId, params = {}) => {
    const res = await api.get(`/conversations/${conversationId}/messages`, { params });
    return res.data;
  },
};

export default api;

