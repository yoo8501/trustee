import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    // Playwright spec 파일은 vitest 에서 실행하지 않는다.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
});
