/**
 * Test runner configuration.
 *
 * The suite covers the pure-logic modules that encode this product's promises:
 * plan entitlements and quota accounting, the trust guardrails that keep the AI
 * from claiming certainty, the authenticity engine's banding, and the policy
 * reference data. None of it needs a DOM or a database, so the environment is
 * plain `node` — a jsdom environment would only add startup cost and mask the
 * fact that these modules are supposed to run on the server.
 *
 * `alias` mirrors the `@/*` path in tsconfig.json. Vitest does not read
 * tsconfig paths on its own, so without this every `@/lib/...` import in a test
 * fails to resolve.
 */
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    // Colocated with the code they cover, so a module and its test move together.
    include: ['src/**/*.test.ts'],
    // Fail the run if a test file contains no tests: a suite that silently
    // matches nothing would report success while covering nothing.
    passWithNoTests: false,
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/lib/**/*.ts'],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
