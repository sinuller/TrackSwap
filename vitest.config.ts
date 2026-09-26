import { defineConfig } from 'vitest/config';

// Separate config so the unit tests don't load the Svelte/PWA plugins.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
