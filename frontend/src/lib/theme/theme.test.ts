import { describe, expect, it } from 'vitest';
import { darkTokens, lightTokens } from './tokens';
import { createAppTheme, getTokens } from './theme';

describe('createAppTheme', () => {
  it('light 모드는 lightTokens를 MUI palette에 매핑한다', () => {
    const t = createAppTheme('light');
    expect(t.palette.mode).toBe('light');
    expect(t.palette.primary.main).toBe(lightTokens.accent);
    expect(t.palette.background.default).toBe(lightTokens.bg);
    expect(t.palette.background.paper).toBe(lightTokens.surface);
    expect(t.palette.text.primary).toBe(lightTokens.ink);
    expect(t.palette.divider).toBe(lightTokens.line);
  });

  it('dark 모드는 darkTokens를 매핑한다', () => {
    const t = createAppTheme('dark');
    expect(t.palette.mode).toBe('dark');
    expect(t.palette.primary.main).toBe(darkTokens.accent);
    expect(t.palette.background.default).toBe(darkTokens.bg);
    expect(t.palette.background.paper).toBe(darkTokens.surface);
    expect(t.palette.text.primary).toBe(darkTokens.ink);
  });

  it('getTokens는 모드에 따라 light/dark 토큰을 돌려준다', () => {
    expect(getTokens('light')).toBe(lightTokens);
    expect(getTokens('dark')).toBe(darkTokens);
  });
});
