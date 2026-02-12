import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'tests/**',
        'src/__tests__/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        'dist/**',
      ],
    },
    testTimeout: 10000,
    mockReset: true,
    restoreMocks: true,
  },
});
