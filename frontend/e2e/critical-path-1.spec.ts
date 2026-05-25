/**
 * Critical Path 1 (Playwright) — 회원가입 → 로그인 → 대시보드.
 *
 * 실제 BE (Go) 가 떠 있을 때만 의미가 있다. BE 미기동 시 자동 skip.
 * 단위 검증은 src/features/auth/critical-path-1.test.tsx (Vitest + MSW) 에서 수행.
 */
import { expect, test } from '@playwright/test';

const BACKEND_URL = process.env.E2E_BACKEND_URL ?? 'http://localhost:8080';

test.beforeAll(async () => {
  try {
    const res = await fetch(`${BACKEND_URL}/health`, { method: 'GET' });
    if (!res.ok) {
      test.skip(true, `Backend at ${BACKEND_URL} not healthy`);
    }
  } catch {
    test.skip(true, `Backend at ${BACKEND_URL} unreachable`);
  }
});

test('회원가입 → 자동 로그인 → 홈 진입', async ({ page }) => {
  const email = `e2e-${Date.now()}@docflow.dev`;
  await page.goto('/register');
  await page.getByLabel('이름').fill('E2E 사용자');
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호').fill('password!');
  await page.getByTestId('register-submit').click();
  await expect(page.getByTestId('home-welcome')).toContainText('E2E 사용자');
});
