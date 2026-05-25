import { describe, expect, it } from 'vitest';
import i18n, { supportedLanguages } from './index';

describe('i18n bootstrap', () => {
  it('ko, en 리소스를 모두 등록한다', () => {
    expect(supportedLanguages).toEqual(['ko', 'en']);
    expect(i18n.hasResourceBundle('ko', 'translation')).toBe(true);
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(true);
  });

  it('error.VALIDATION_FAILED 키가 양 언어 모두에 있다', () => {
    expect(i18n.getResource('ko', 'translation', 'error.VALIDATION_FAILED'))
      .toBeTruthy();
    expect(i18n.getResource('en', 'translation', 'error.VALIDATION_FAILED'))
      .toBeTruthy();
  });

  it('app.title 도메인 키가 양 언어 모두에 있다', () => {
    expect(i18n.getResource('ko', 'translation', 'app.title')).toBe(
      'DocFlow',
    );
    expect(i18n.getResource('en', 'translation', 'app.title')).toBe(
      'DocFlow',
    );
  });
});
