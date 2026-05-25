import { createContext } from 'react';
import type { CurrentUser } from '../api';
import type { LoginInput, RegisterInput } from '../schemas';

export interface AuthContextValue {
  /** 현재 로그인 사용자. 로그아웃/미로그인 시 null. */
  user: CurrentUser | null;
  /** `useCurrentUser` 의 초기 로드 / refetch 진행 여부. */
  isLoading: boolean;
  /** 토큰이 메모리/스토리지에 존재하는지. 라우트 가드용 빠른 체크. */
  isAuthenticated: boolean;
  login(input: LoginInput): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
