import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    testTimeout: 20000,
    reporters: ['basic'],
    coverage: {
      reporter: ['text'],
      exclude: ['**/*.test.ts', '**/mocks/**']
    },
    poolOptions: {
      threads: {
        singleThread: true
      }
    },
    maxConcurrency: 1,
    isolate: false
  }
});
