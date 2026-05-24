import apiClient from './client';
import type { ApiResponse, ApiListResponse } from '@/types/api';
import type { User, ChangePasswordRequest, UpdateUserRoleRequest } from '@/types/auth';

export const usersApi = {
  updateMe: async (data: { name: string }) => {
    const res = await apiClient.patch<ApiResponse<User>>('/api/users/me', data);
    return res.data.data;
  },

  changePassword: async (data: ChangePasswordRequest) => {
    await apiClient.patch('/api/users/me/password', data);
  },

  listUsers: async (page = 1, limit = 20) => {
    const res = await apiClient.get<ApiListResponse<User>>('/api/users', {
      params: { page, limit },
    });
    return res.data;
  },

  updateRole: async (userId: string, data: UpdateUserRoleRequest) => {
    const res = await apiClient.patch<ApiResponse<User>>(`/api/users/${userId}`, data);
    return res.data.data;
  },
};
