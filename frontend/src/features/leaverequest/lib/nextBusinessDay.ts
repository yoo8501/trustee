/**
 * 다음 영업일 계산기.
 *
 * UX §4 — 휴가 기간 기본값은 "오늘" 이 아니라 **다음 영업일**.
 * 토/일 + 한국 공휴일(YYYY-MM-DD) 은 skip.
 *
 * 입력 `from` 은 KST 의 자정 또는 임의 시각. 본 함수는 날짜만 본다 (시간 정보는 시작 09:00 으로 정규화).
 */

const SATURDAY = 6;
const SUNDAY = 0;

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isWeekend(d: Date): boolean {
  const w = d.getDay();
  return w === SATURDAY || w === SUNDAY;
}

/**
 * @param from 기준 날짜. 기본 `new Date()`. 본 날짜 다음날부터 탐색.
 * @param holidays 휴일 목록 (YYYY-MM-DD 또는 Date). 매칭은 날짜만.
 * @returns Date — 다음 영업일 (시작 09:00:00 로 정규화).
 */
export function nextBusinessDay(
  from: Date = new Date(),
  holidays: ReadonlyArray<string | Date> = [],
): Date {
  const holidaySet = new Set<string>(
    holidays.map((h) => (typeof h === 'string' ? h : toDateKey(h))),
  );

  // 다음날부터 탐색
  const cursor = new Date(from);
  cursor.setHours(9, 0, 0, 0);
  cursor.setDate(cursor.getDate() + 1);

  // 안전 가드 — 무한 루프 방지 (최대 365일 탐색)
  for (let i = 0; i < 365; i++) {
    if (!isWeekend(cursor) && !holidaySet.has(toDateKey(cursor))) {
      return cursor;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  // 모든 365일이 휴일/주말인 경우는 실제로 불가. fallback 으로 from + 1일.
  const fallback = new Date(from);
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(9, 0, 0, 0);
  return fallback;
}

/**
 * 폼 기본값에 쓰일 helper — 시작/종료 시각 페어 반환.
 *  - 시작: 다음 영업일 09:00
 *  - 종료: 같은 날 18:00 (점심 1시간 제외 = 8시간)
 */
export function nextBusinessDayRange(
  from: Date = new Date(),
  holidays: ReadonlyArray<string | Date> = [],
): { startAt: string; endAt: string } {
  const start = nextBusinessDay(from, holidays);
  const end = new Date(start);
  end.setHours(18, 0, 0, 0);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}
