/**
 * vitest.config.ts — E2E suite configuration.
 *
 * Resolves @ddx/term-contract from source (no build step needed) and
 * ddx-term-mcp/src via relative imports. Timeout is generous because real tmux
 * sessions + interactive programs (uv, pnpm tsx) have non-trivial startup
 * latency. The latency suite runs 200 samples each pass.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Resolve @ddx/term-contract from source so the e2e suite needs no build step.
      '@ddx/term-contract': resolve(
        import.meta.dirname,
        '../packages/ddx-term-contract/src/index.ts',
      ),
    },
  },
  test: {
    // Real tmux sessions have startup latency; interactive programs (uv, pnpm tsx)
    // need generous time. Latency suite runs 200 samples.
    testTimeout: 120_000,
    hookTimeout: 60_000,
    // Sequential: each suite manages its own temp socket/session; parallel suites
    // writing to /tmp concurrently risks socket path collisions on slow machines.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Report p50/p95 latency lines to stdout so CI captures them.
    reporter: ['verbose'],
    include: ['**/*.e2e.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
