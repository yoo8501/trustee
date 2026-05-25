import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EXPENSE_DRAFT_STORAGE_KEY,
  EXPENSE_DRAFT_TTL_MS,
  expenseDraftStorage,
} from './draftStorage';

describe('expenseDraftStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('save → load 로 동일 데이터 반환', () => {
    expenseDraftStorage.save({
      amountWon: 12000,
      vendor: '식당',
      purpose: '점심',
      paidAt: '2026-05-25',
    });
    expect(expenseDraftStorage.load()).toEqual({
      amountWon: 12000,
      vendor: '식당',
      purpose: '점심',
      paidAt: '2026-05-25',
    });
  });

  it('load — 저장된 값 없으면 null', () => {
    expect(expenseDraftStorage.load()).toBeNull();
  });

  it('TTL 24h 초과 시 만료 → null + localStorage 정리', () => {
    expenseDraftStorage.save({ amountWon: 12000 });
    const now = Date.now();
    expect(expenseDraftStorage.load(now + EXPENSE_DRAFT_TTL_MS + 1)).toBeNull();
    expect(window.localStorage.getItem(EXPENSE_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('TTL 24h 안쪽이면 살아있음', () => {
    expenseDraftStorage.save({ amountWon: 12000 });
    const now = Date.now();
    expect(
      expenseDraftStorage.load(now + EXPENSE_DRAFT_TTL_MS - 1),
    ).toEqual({ amountWon: 12000 });
  });

  it('clear → 저장된 값 제거', () => {
    expenseDraftStorage.save({ amountWon: 12000 });
    expenseDraftStorage.clear();
    expect(expenseDraftStorage.load()).toBeNull();
  });

  it('손상된 JSON 은 무시 + 정리', () => {
    window.localStorage.setItem(EXPENSE_DRAFT_STORAGE_KEY, '{broken');
    expect(expenseDraftStorage.load()).toBeNull();
    expect(window.localStorage.getItem(EXPENSE_DRAFT_STORAGE_KEY)).toBeNull();
  });
});
