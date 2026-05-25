/**
 * 원화(KRW) 포맷팅 유틸 — Sprint 7 지출결의서.
 *
 * - format: 12345 → "12,345원"
 * - parse: "12,345원" → 12345 (숫자 외 문자 제거)
 * - formatCommaInput: 폼 입력 onChange 용 (단위 없이 콤마만, 예: 12345 → "12,345")
 *
 * 음수/0 정책은 schema 계층에서 차단. 본 모듈은 표현 변환만 담당.
 */

export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return '0원';
  return `${Math.trunc(value).toLocaleString('ko-KR')}원`;
}

export function formatCommaInput(value: number | string): string {
  const n = typeof value === 'number' ? value : parseCurrency(value);
  if (!Number.isFinite(n) || n === 0) return '';
  return Math.trunc(n).toLocaleString('ko-KR');
}

export function parseCurrency(input: string): number {
  if (typeof input !== 'string') return 0;
  const digits = input.replace(/[^0-9]/g, '');
  if (digits.length === 0) return 0;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}
