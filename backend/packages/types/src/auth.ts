// 사용자 역할
export type UserRole = "admin" | "user";

// 사용자 정보
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

// 로그인 입력
export interface LoginInput {
  email: string;
  password: string;
}

// 회원가입 입력
export interface SignupInput {
  email: string;
  password: string;
  name: string;
}

// 비밀번호 찾기 입력
export interface ForgotPasswordInput {
  email: string;
}

// 비밀번호 재설정 입력
export interface ResetPasswordInput {
  token: string;
  password: string;
  confirmPassword: string;
}

// 인증 응답
export interface AuthResponse {
  data: {
    user: User;
    accessToken: string;
    refreshToken: string;
  };
}

// 인증 상태 (프론트엔드)
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
