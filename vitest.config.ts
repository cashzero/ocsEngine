import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // UI tests build and play the full default operation (32×24, six divisions a side); alone they take
    // 3-5 s, so under a parallel run the 5 s default fails them at random.
    testTimeout: 15_000,
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
