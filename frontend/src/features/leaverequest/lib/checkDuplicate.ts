import type { LeaveRequest } from '../schemas';

/**
 * 같은 날짜 휴가 중복 검증 (UX §3 폼 단계 차단).
 *
 * BE 도 400 + DUPLICATE_LEAVE_DATE 로 거부하지만, 사용자가 제출 버튼을 누른 후
 * 서버 reject 를 받는 것보다 폼에서 미리 차단하는 게 빠르다.
 *
 * 비교 기준:
 *  - 기존 status: pending 또는 approved 와만 중복 검사 (cancelled/rejected 는 무시)
 *  - 날짜 범위가 겹치면 충돌 (시간 단위 휴가가 아니라 휴가일 단위 중복).
 */
function toDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function* dayRange(startIso: string, endIso: string): Iterable<string> {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
  // 같은 날 안 여러 시간 휴가도 단일 날짜로 비교
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor.getTime() <= last.getTime()) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    yield `${y}-${m}-${d}`;
    cursor.setDate(cursor.getDate() + 1);
  }
}

export function collectExistingDates(
  requests: ReadonlyArray<LeaveRequest>,
): Set<string> {
  const set = new Set<string>();
  for (const r of requests) {
    if (r.status !== 'pending' && r.status !== 'approved') continue;
    for (const k of dayRange(r.startAt, r.endAt)) {
      set.add(k);
    }
  }
  return set;
}

export function checkDuplicate(
  startAt: string,
  endAt: string,
  existing: ReadonlySet<string>,
): boolean {
  if (!startAt || !endAt) return false;
  for (const k of dayRange(startAt, endAt)) {
    if (existing.has(k)) return true;
  }
  return false;
}

export function toDateKeyForTest(iso: string): string {
  return toDateKey(iso);
}
