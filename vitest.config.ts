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
          // The Auth emulator only issues tokens for its default project (demo-jci), which both
          // resource.test.ts and client.test.ts use and clear, so emulator files run one at a time.
          // In vitest 3.2 the scheduler reads only the root value, so `--no-file-parallelism` in the
          // test:emulator script is what actually enforces this.
          fileParallelism: false,
          testTimeout: 20000,
          hookTimeout: 30000,
        },
      },
    ],
  },
});
