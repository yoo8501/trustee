import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  tokenStorage,
} from './tokenStorage';

describe('tokenStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('set 후 getAccess/getRefresh 가 값을 반환한다', () => {
    tokenStorage.set('access-1', 'refresh-1');
    expect(tokenStorage.getAccess()).toBe('access-1');
    expect(tokenStorage.getRefresh()).toBe('refresh-1');
    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('access-1');
    expect(window.localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-1');
  });

  it('clear 는 두 키 모두 제거', () => {
    tokenStorage.set('a', 'r');
    tokenStorage.clear();
    expect(tokenStorage.getAccess()).toBeNull();
    expect(tokenStorage.getRefresh()).toBeNull();
  });

  it('미설정 상태에서 getter 는 null', () => {
    expect(tokenStorage.getAccess()).toBeNull();
    expect(tokenStorage.getRefresh()).toBeNull();
  });

  it('onAccessChange — 다른 탭에서 access 가 제거되면 false 로 알림', () => {
    const cb = vi.fn();
    const off = tokenStorage.onAccessChange(cb);
    // 다른 탭에서 access 키를 null 로 만든 시나리오 시뮬레이션
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: ACCESS_TOKEN_KEY,
        oldValue: 'old',
        newValue: null,
      }),
    );
    expect(cb).toHaveBeenCalledWith(false);
    off();
  });

  it('onAccessChange — 다른 탭에서 access 가 설정되면 true 로 알림', () => {
    const cb = vi.fn();
    const off = tokenStorage.onAccessChange(cb);
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: ACCESS_TOKEN_KEY,
        oldValue: null,
        newValue: 'new',
      }),
    );
    expect(cb).toHaveBeenCalledWith(true);
    off();
  });

  it('onAccessChange — 무관한 키 변경은 무시', () => {
    const cb = vi.fn();
    const off = tokenStorage.onAccessChange(cb);
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'some-other-key',
        oldValue: null,
        newValue: 'x',
      }),
    );
    expect(cb).not.toHaveBeenCalled();
    off();
  });

  it('onAccessChange — off 호출 후엔 더이상 알림 받지 않음', () => {
    const cb = vi.fn();
    const off = tokenStorage.onAccessChange(cb);
    off();
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: ACCESS_TOKEN_KEY,
        newValue: null,
      }),
    );
    expect(cb).not.toHaveBeenCalled();
  });
});
