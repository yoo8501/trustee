/**
 * KST(Asia/Seoul) 기준 오늘 work_date (YYYY-MM-DD).
 *
 * Application layer 변환 (CLAUDE.md §3.7 — DB 는 UTC TIMESTAMPTZ, 표현은 KST).
 * `Intl.DateTimeFormat` 으로 timezone 강제 (서버/사용자 OS 와 무관).
 */
export function todayKST(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '00';
  const d = parts.find((p) => p.type === 'day')?.value ?? '00';
  return `${y}-${m}-${d}`;
}

/**
 * ISO 8601 (UTC) → KST `HH:mm` 표시.
 * 사용자 OS timezone 과 무관하게 항상 KST.
 */
export function formatTimeKST(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}
