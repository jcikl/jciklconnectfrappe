import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/core/src/**/*.test.ts', 'packages/doctypes/src/**/*.test.ts', 'tools/**/*.test.mjs'],
  },
});
