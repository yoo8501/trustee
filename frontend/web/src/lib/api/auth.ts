import { apiClient } from "./client";
import type {
  LoginInput,
  SignupInput,
  ForgotPasswordInput,
  User,
  AuthResponse,
} from "@trustee/types";

interface UserResponse {
  data: User;
}

interface MessageResponse {
  data: { message: string };
}

export const authApi = {
  login: (data: LoginInput) =>
    apiClient.post<AuthResponse>("/api/auth/login", data),

  signup: (data: SignupInput) =>
    apiClient.post<UserResponse>("/api/auth/signup", data),

  logout: () => apiClient.post<void>("/api/auth/logout"),

  refresh: () => apiClient.post<AuthResponse>("/api/auth/refresh"),

  me: () => apiClient.get<UserResponse>("/api/auth/me"),

  forgotPassword: (data: ForgotPasswordInput) =>
    apiClient.post<MessageResponse>("/api/auth/forgot-password", data),

  resetPassword: (data: { token: string; password: string }) =>
    apiClient.post<MessageResponse>("/api/auth/reset-password", data),

  socialGoogle: (data: { token: string }) =>
    apiClient.post<AuthResponse>("/api/auth/social/google", data),

  socialGithub: (data: { code: string }) =>
    apiClient.post<AuthResponse>("/api/auth/social/github", data),
};
