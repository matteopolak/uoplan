import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    __COMMIT_HASH__: JSON.stringify(
      (process.env.CF_PAGES_COMMIT_SHA || 'dev').slice(0, 7)
    ),
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.pnpm-store/**'],
  },
});
