/**
 * 월간 캘린더 셀 그리드 계산기.
 *
 * 한국 캘린더 관례: 일요일 시작 (Sun=0 ~ Sat=6). 5~6주 노출.
 * 각 셀은 ISO date(YYYY-MM-DD) 만 갖고, 이벤트 매핑은 호출 측 책임.
 *
 * 순수 함수 — `new Date(year, monthIdx, day)` 만 사용해 타임존 영향 최소화.
 */
export interface MonthCell {
  iso: string; // YYYY-MM-DD
  day: number; // 1~31
  inMonth: boolean;
  isToday: boolean;
  weekday: number; // 0=일 ~ 6=토
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isoToYearMonth(iso: string): string {
  // YYYY-MM-DD → YYYY-MM
  return iso.slice(0, 7);
}

export function yearMonthToFirst(ym: string): Date {
  const [y, m] = ym.split('-').map((s) => Number.parseInt(s, 10));
  return new Date(y, (m ?? 1) - 1, 1);
}

export function shiftMonth(ym: string, delta: number): string {
  const first = yearMonthToFirst(ym);
  first.setMonth(first.getMonth() + delta);
  return `${first.getFullYear()}-${pad(first.getMonth() + 1)}`;
}

/**
 * 주어진 YYYY-MM 에 대해 6 x 7 = 42 셀 (일요일 시작) 반환.
 *
 * 앞쪽은 이전 달 꼬리, 뒤쪽은 다음 달 머리로 채워서 캘린더 빈칸 없음.
 */
export function buildMonthGrid(ym: string, today: Date = new Date()): MonthCell[] {
  const first = yearMonthToFirst(ym);
  const firstWeekday = first.getDay(); // 0=일
  const start = new Date(first);
  start.setDate(start.getDate() - firstWeekday);

  const todayIso = toIsoDate(today);
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({
      iso: toIsoDate(d),
      day: d.getDate(),
      inMonth: d.getMonth() === first.getMonth(),
      isToday: toIsoDate(d) === todayIso,
      weekday: d.getDay(),
    });
  }
  return cells;
}

/**
 * 주어진 YYYY-MM 의 from/to 범위 (POST body 용).
 *
 * 앞쪽/뒤쪽 다른 달 일부도 그리드에 노출되므로 약간 여유 있게 -7 / +7.
 */
export function monthRange(ym: string): { from: string; to: string } {
  const first = yearMonthToFirst(ym);
  const from = new Date(first);
  from.setDate(from.getDate() - 7);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const to = new Date(last);
  to.setDate(to.getDate() + 7);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

/**
 * ISO datetime/date 가 주어진 YYYY-MM-DD 에 걸치는지.
 *
 * `[startAt, endAt]` (inclusive) vs `targetIso` (그 날 00:00~23:59:59 범위와 교차).
 */
export function intersectsDate(
  startAt: string,
  endAt: string,
  targetIso: string,
): boolean {
  const start = startAt.slice(0, 10);
  const end = endAt.slice(0, 10);
  return targetIso >= start && targetIso <= end;
}

/**
 * 주어진 YYYY-MM-DD 기준 일요일~토요일 7개 ISO 일자 반환.
 */
export function buildWeekDays(anchorIso: string): string[] {
  const [y, m, d] = anchorIso.split('-').map((s) => Number.parseInt(s, 10));
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  const start = new Date(date);
  start.setDate(start.getDate() - date.getDay()); // back to Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(start);
    x.setDate(start.getDate() + i);
    return toIsoDate(x);
  });
}
