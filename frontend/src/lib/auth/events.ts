/**
 * Auth expired event — http interceptor 가 refresh 실패 시 발행하고,
 * AuthProvider 가 구독하여 navigate('/login') 한다.
 *
 * http 모듈은 React Router 의 navigate 를 직접 호출할 수 없기 때문에
 * CustomEvent 로 결합도를 끊는다.
 */
export const AUTH_EXPIRED_EVENT = 'docflow:auth:expired';

export function emitAuthExpired(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
}
