import axios from 'axios';

// Get API URL from environment variable or use localhost default
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Debug logging
console.log('API Configuration:', {
  env: import.meta.env.MODE,
  vite_api_url: import.meta.env.VITE_API_URL,
  final_api_base_url: API_BASE_URL,
  timestamp: new Date().toISOString()
});

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor - attach JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Debug log API calls in development
    if (import.meta.env.MODE === 'development') {
      console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    }

    return config;
  },
  (error) => {
    console.error('Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor - handle responses and errors
api.interceptors.response.use(
  (response) => {
    if (import.meta.env.MODE === 'development') {
      console.log(`API Response: ${response.status} ${response.config.url}`);
    }
    return response;
  },
  (error) => {
    // Handle expired/invalid sessions without hiding login form errors.
    const isLoginRequest = error.config?.url === '/auth/login';

    if (error.response && error.response.status === 401 && !isLoginRequest) {
      console.warn('Unauthorized (401) - Clearing auth and redirecting to login');
      localStorage.removeItem('token');
      localStorage.removeItem('user');

      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    // Log errors
    console.error('API Error:', {
      status: error.response?.status,
      message: error.response?.data?.message || error.message,
      url: error.config?.url
    });

    return Promise.reject(error);
  }
);

export default api;
