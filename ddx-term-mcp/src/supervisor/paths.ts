/**
 * paths.ts — filesystem locations for the supervisor's lock files and bundled
 * entry-point scripts.
 *
 * The lock directory (~/.ddx-term/) is created eagerly on first import so that
 * callers can open lock files without a separate mkdir step.  The bundled entry
 * paths (dist/broker/main.js, dist/web/server.mjs) are resolved relative to
 * THIS file's directory inside the published bundle; at test time the paths are
 * injected via deps so their physical absence does not matter.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── lock directory ──────────────────────────────────────────────────────────

/** Root directory for all ddx-term supervisor state (~/.ddx-term/). */
export const DDX_TERM_DIR = join(homedir(), '.ddx-term');

// Ensure the directory exists the moment this module loads.
mkdirSync(DDX_TERM_DIR, { recursive: true });

/** Exclusive lock file for the broker singleton. */
export const BROKER_LOCK_PATH = join(DDX_TERM_DIR, 'broker.lock');

/** Exclusive lock file for the web singleton. */
export const WEB_LOCK_PATH = join(DDX_TERM_DIR, 'web.lock');

// ── bundled entry paths ─────────────────────────────────────────────────────

/**
 * Absolute path to the broker entry point inside the published MCP bundle.
 *
 * The bundle layout (produced by bn1) places these artifacts alongside
 * dist/server.js:
 *   dist/broker/main.js               — NestJS broker (CJS, pnpm deploy)
 *   dist/web/.next/standalone/        — Next.js standalone output
 *     ddx-term-web/
 *       server.mjs                    — custom WS-proxy server entry
 *       node_modules/next/            — next package (pnpm symlink → .pnpm)
 *       .next/                        — compiled pages + routes
 *         static/                     — static assets (copied from .next/static)
 *
 * server.mjs lives INSIDE the standalone's ddx-term-web/ so that Node's module
 * resolution finds next (sibling node_modules/next) and next() itself can locate
 * .next/ via __dirname without needing an explicit dir option.
 *
 * We resolve relative to THIS file so the calculation works both in the
 * published bundle (dist/supervisor/paths.js → dist/) and under tsx/vitest
 * (src/supervisor/paths.ts → src/).  Tests inject their own paths via deps;
 * the constants below are only used by the real spawn path.
 */
/**
 * The directory that CONTAINS broker/ and web/ at runtime. This differs by layout:
 *   - published bundle: tsup flattens everything into dist/server.js, so this file's
 *     code runs from dist/ and broker/ + web/ are SIBLINGS → bundle dir = dirname(server.js).
 *   - dev/tsx/vitest: this file runs from src/supervisor/paths.ts, one level below src/;
 *     there is no real broker/ there (tests inject paths via deps).
 * The old `resolve(dirname, '..')` assumed a supervisor/ subdir depth that tsup erases,
 * so in the bundle it overshot to the PACKAGE ROOT and spawned .../broker/main.js
 * (nonexistent) instead of .../dist/broker/main.js. We now probe: prefer the sibling
 * layout (bundle), fall back to the parent layout (source), so both resolve correctly.
 */
function resolveBundleDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // Bundle (flat): broker/ is a sibling of server.js in `here`.
  if (existsSync(join(here, 'broker', 'main.js'))) return here;
  // Source layout: broker/ lives one level up (here === src/supervisor → src/).
  const parent = resolve(here, '..');
  if (existsSync(join(parent, 'broker', 'main.js'))) return parent;
  // Neither exists (e.g. unbuilt tree under test) — default to `here`; tests inject
  // their own paths via deps, so the physical absence does not matter.
  return here;
}

const BUNDLE_DIR = resolveBundleDir();

/** Resolved path to <bundle>/broker/main.js. */
export const BROKER_ENTRY = join(BUNDLE_DIR, 'broker', 'main.js');

/**
 * Resolved path to <bundle>/web/.next/standalone/ddx-term-web/server.mjs.
 * server.mjs lives inside the standalone app dir so next + sibling node_modules
 * resolve naturally without extra injection.
 */
export const WEB_ENTRY = join(
  BUNDLE_DIR, 'web', '.next', 'standalone', 'ddx-term-web', 'server.mjs',
);
