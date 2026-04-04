import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { lingui } from '@lingui/vite-plugin';

export default defineConfig({
  plugins: [react(), lingui()],
  define: {
    __COMMIT_HASH__: JSON.stringify(
      (process.env.CF_PAGES_COMMIT_SHA || 'dev').slice(0, 7)
    ),
    __BRANCH_NAME__: JSON.stringify(process.env.CF_PAGES_BRANCH || ''),
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.pnpm-store/**'],
  },
  build: {
    sourcemap: true,
  }
});
