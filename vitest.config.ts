import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/core/src/**/*.test.ts', 'packages/doctypes/src/**/*.test.ts', 'packages/client/src/**/*.test.ts', 'tools/**/*.test.mjs'],
        },
      },
      {
        // Needs the Firebase emulators: run through `npm run test:emulator`.
        test: {
          name: 'emulator',
          include: ['tests/emulator/**/*.test.ts'],
          testTimeout: 20000,
          hookTimeout: 30000,
        },
      },
    ],
  },
});
