import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DRAFT_STORAGE_KEY,
  DRAFT_TTL_MS,
  draftStorage,
} from './draftStorage';

describe('draftStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('save → load 로 동일 데이터 반환', () => {
    draftStorage.save({
      leaveTypeId: 1,
      hours: 8,
      reason: '가족 행사',
    });
    const loaded = draftStorage.load();
    expect(loaded).toEqual({
      leaveTypeId: 1,
      hours: 8,
      reason: '가족 행사',
    });
  });

  it('load — 저장된 값 없으면 null', () => {
    expect(draftStorage.load()).toBeNull();
  });

  it('TTL 24h 초과 시 만료 → null + localStorage 정리', () => {
    draftStorage.save({ hours: 8 });
    const now = Date.now();
    const expired = now + DRAFT_TTL_MS + 1;
    expect(draftStorage.load(expired)).toBeNull();
    // 만료된 항목은 자동 제거
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('TTL 24h 정확히 1ms 안쪽이면 살아있음', () => {
    draftStorage.save({ hours: 4 });
    const now = Date.now();
    const justInside = now + DRAFT_TTL_MS - 1;
    expect(draftStorage.load(justInside)).toEqual({ hours: 4 });
  });

  it('clear → 저장된 값 제거', () => {
    draftStorage.save({ hours: 8 });
    draftStorage.clear();
    expect(draftStorage.load()).toBeNull();
  });

  it('손상된 JSON 은 무시하고 null + 정리', () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, '{not-json');
    expect(draftStorage.load()).toBeNull();
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('wrapper shape 깨진 데이터는 무시 + 정리', () => {
    window.localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ data: { hours: 8 } }), // savedAt 누락
    );
    expect(draftStorage.load()).toBeNull();
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });
});
