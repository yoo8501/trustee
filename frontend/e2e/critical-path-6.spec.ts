/**
 * Critical Path 6 (Playwright) — token 만료 → silent refresh.
 *
 * 실제 BE 가 떠 있을 때만 의미가 있다. BE 미기동 시 자동 skip.
 * 단위 검증은 src/features/auth/critical-path-6.test.tsx (Vitest + MSW) 에서 수행.
 *
 * 운영 BE 의 access 만료(1h)를 그대로 기다리는 건 비현실적이므로,
 * 시드 단계에서 access TTL 을 짧게(예: 5s) 설정한 환경 변수 (`E2E_SHORT_TTL=true`)
 * 가 동작할 때만 실행한다.
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
  if (!process.env.E2E_SHORT_TTL) {
    test.skip(true, 'E2E_SHORT_TTL not set — access token expiry not testable');
  }
});

test('access 만료 후 다음 API 호출이 silent refresh 로 끊김 없이 성공', async ({
  page,
}) => {
  const email = `expire-${Date.now()}@docflow.dev`;
  await page.goto('/register');
  await page.getByLabel('이름').fill('만료 사용자');
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호').fill('password!');
  await page.getByTestId('register-submit').click();
  await expect(page.getByTestId('home-welcome')).toBeVisible();

  // 짧은 TTL 환경: 6초 대기 후 페이지 리로드 → me 호출이 일어나야 함
  await page.waitForTimeout(6_000);
  await page.reload();
  await expect(page.getByTestId('home-welcome')).toContainText('만료 사용자');
});
