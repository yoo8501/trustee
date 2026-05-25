import { useQuery } from '@tanstack/react-query';
import { adminApi, type UserListRequest } from '../api/client';
import type { AdminUser } from '../schemas';
import { adminKeys } from './keys';

/**
 * 사용자 목록 조회 — POST /api/users/list.
 *
 * `context/api.md` §3 에 따르면 목록은 POST 지만, 화면 anchor 가 목록이라
 * "최초 진입 시 자동 fetch + filter 변경 시 refetch" 패턴이 적합하다.
 * 본 sprint 에서는 useQuery 로 처리 (목록이 mutation 으로 표현되긴 어색하며,
 * 결과는 idempotent — POST 는 단순 method 선택일 뿐).
 */
export function useUsersList(req: UserListRequest = {}) {
  return useQuery<{ items: AdminUser[]; total: number }>({
    queryKey: adminKeys.usersList(req),
    queryFn: () => adminApi.listUsers(req),
    staleTime: 30_000,
    retry: 1,
  });
}
