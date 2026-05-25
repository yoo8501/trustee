import { http } from '../../../lib/api';
import type { LoginInput, RegisterInput } from '../schemas';

/**
 * Auth API client — BE `internal/auth/handler.go` 응답 shape 과 1:1 매핑.
 *
 * 모든 호출은 `lib/api/http.ts` 의 공통 client 경유 (CLAUDE.md §3.2).
 * `http` 가 envelope 파싱 + 401 refresh interceptor 를 책임지므로 본 모듈은
 * raw `data` 만 다룬다.
 */

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** access token 의 유효 기간(초). */
  expiresIn: number;
  /** 로그인 응답에만 포함. refresh 응답엔 0/누락. */
  userId?: number;
  /** 로그인 응답에만 포함. */
  role?: string;
}

export interface RegisteredUser {
  id: number;
  email: string;
  name: string;
}

export interface CurrentUser {
  id: number;
  email: string;
  name: string;
  status: string;
  role: string;
  teamId: number | null;
  managerId: number | null;
  hireDate: string;
}

export interface LogoutResponse {
  status: string;
}

export const authApi = {
  register(input: RegisterInput): Promise<RegisteredUser> {
    return http.post<RegisteredUser>('/api/auth/register', input);
  },

  login(input: LoginInput): Promise<TokenPair> {
    return http.post<TokenPair>('/api/auth/login', input);
  },

  /**
   * 로그아웃 — BE 가 token_version 을 +1 시켜 모든 기존 토큰을 무효화한다.
   * 인증 헤더 필수 (http interceptor 가 자동으로 첨부).
   */
  logout(): Promise<LogoutResponse> {
    return http.post<LogoutResponse>('/api/auth/logout');
  },

  /** 본인 정보 + role. */
  me(): Promise<CurrentUser> {
    return http.get<CurrentUser>('/api/users/me');
  },
};
