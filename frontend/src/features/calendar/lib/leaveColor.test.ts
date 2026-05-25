import { describe, expect, it } from 'vitest';
import { darkTokens, lightTokens } from '../../../lib/theme/tokens';
import { holidayColor, leaveColor } from './leaveColor';

describe('leaveColor', () => {
  it('annual → leaveAnnual (light)', () => {
    expect(leaveColor('annual', 'light')).toBe(lightTokens.leaveAnnual);
  });

  it('annual → leaveAnnual (dark) — 같은 hue 유지', () => {
    expect(leaveColor('annual', 'dark')).toBe(darkTokens.leaveAnnual);
  });

  it('half_day / quarter_day → leaveHalf', () => {
    expect(leaveColor('half_day', 'light')).toBe(lightTokens.leaveHalf);
    expect(leaveColor('quarter_day', 'dark')).toBe(darkTokens.leaveHalf);
  });

  it('comp_leave → leaveComp', () => {
    expect(leaveColor('comp_leave', 'light')).toBe(lightTokens.leaveComp);
  });

  it('public → leavePublic', () => {
    expect(leaveColor('public', 'light')).toBe(lightTokens.leavePublic);
  });

  it('special → leaveSpecial', () => {
    expect(leaveColor('special', 'dark')).toBe(darkTokens.leaveSpecial);
  });

  it('unknown code → fallback (없으면 ink3)', () => {
    expect(leaveColor('weird', 'light')).toBe(lightTokens.ink3);
    expect(leaveColor('weird', 'light', '#000')).toBe('#000');
  });
});

describe('holidayColor', () => {
  it('light → lightTokens.holiday', () => {
    expect(holidayColor('light')).toBe(lightTokens.holiday);
  });
  it('dark → darkTokens.holiday', () => {
    expect(holidayColor('dark')).toBe(darkTokens.holiday);
  });
});
