import apiClient from './client';
import type { ApiResponse } from '@/types/api';
import type { User, LoginRequest, RegisterRequest } from '@/types/auth';

export const authApi = {
  login: async (data: LoginRequest) => {
    const res = await apiClient.post<ApiResponse<{ user: User }>>('/api/auth/login', data);
    return res.data.data.user;
  },

  register: async (data: RegisterRequest) => {
    const res = await apiClient.post<ApiResponse<{ user: User }>>('/api/auth/register', data);
    return res.data.data.user;
  },

  logout: async () => {
    await apiClient.post('/api/auth/logout');
  },

  getMe: async () => {
    const res = await apiClient.get<ApiResponse<User>>('/api/users/me');
    return res.data.data;
  },
};
