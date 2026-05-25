import { describe, expect, it } from 'vitest';
import {
  formatCommaInput,
  formatCurrency,
  parseCurrency,
} from './formatCurrency';

describe('formatCurrency', () => {
  it('숫자 → ko-KR 콤마 + 원 suffix', () => {
    expect(formatCurrency(12000)).toBe('12,000원');
    expect(formatCurrency(1234567)).toBe('1,234,567원');
  });

  it('0 → "0원"', () => {
    expect(formatCurrency(0)).toBe('0원');
  });

  it('소수점은 정수로 truncate', () => {
    expect(formatCurrency(12000.7)).toBe('12,000원');
  });

  it('NaN/Infinity → "0원"', () => {
    expect(formatCurrency(Number.NaN)).toBe('0원');
    expect(formatCurrency(Number.POSITIVE_INFINITY)).toBe('0원');
  });
});

describe('formatCommaInput', () => {
  it('숫자 → 콤마 (suffix 없음)', () => {
    expect(formatCommaInput(12000)).toBe('12,000');
    expect(formatCommaInput(1234567)).toBe('1,234,567');
  });

  it('0 → 빈 문자열 (placeholder 잘 보이게)', () => {
    expect(formatCommaInput(0)).toBe('');
    expect(formatCommaInput('')).toBe('');
  });

  it('문자열 입력도 처리', () => {
    expect(formatCommaInput('12000')).toBe('12,000');
    expect(formatCommaInput('12,000')).toBe('12,000');
  });
});

describe('parseCurrency', () => {
  it('"12,345원" → 12345', () => {
    expect(parseCurrency('12,345원')).toBe(12345);
  });

  it('"₩ 1,234,567" → 1234567', () => {
    expect(parseCurrency('₩ 1,234,567')).toBe(1234567);
  });

  it('숫자만 있는 문자열 → 그대로 파싱', () => {
    expect(parseCurrency('99000')).toBe(99000);
  });

  it('빈 문자열 → 0', () => {
    expect(parseCurrency('')).toBe(0);
    expect(parseCurrency('원')).toBe(0);
  });

  it('알파벳 섞인 입력은 숫자만 추출', () => {
    expect(parseCurrency('a1b2c3')).toBe(123);
  });
});
