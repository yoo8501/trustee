import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 기본 설정. CI 외 환경에서는 dev 서버를 재사용한다.
 *
 * Sprint 2 단계에선 BE 의존 critical path 두 건을 spec 으로 정의하되,
 * 실제 백엔드 (Go + Postgres) 부트 환경이 마련되기 전까지는
 * 단위/통합 테스트(Vitest + MSW) 가 검증을 책임진다. — frontend/CLAUDE.md §7
 */
export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: 'bun run dev',
        url: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
