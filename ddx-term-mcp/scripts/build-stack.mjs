#!/usr/bin/env node
/**
 * build-stack.mjs — assemble the published tarball's broker + web artifacts.
 *
 * Produces:
 *   dist/broker/main.js              NestJS broker (dist-copy from pnpm deploy, CJS)
 *   dist/broker/node_modules/        full production deps (via pnpm deploy --legacy --prod)
 *   dist/web/server.mjs              Next.js custom standalone entry
 *   dist/web/.next/standalone/**     traced Next.js bundle
 *   dist/web/.next/standalone/ddx-term-web/.next/static/  web assets (NESTED path)
 *   dist/web/messages/               next-intl locale JSONs (en/de/fr)
 *   dist/web/node_modules/ws/        ws module (absent from nft trace)
 *
 * APPROACH: tsup-bundling NestJS fails (decorator/reflect-metadata — esbuild does
 * not support experimentalDecorators).  We use `pnpm deploy --legacy --prod` to
 * produce a self-contained broker directory with all production deps resolved, then
 * copy it to dist/broker/.
 *
 * DEVIATION: broker is dist-copy + pnpm-deployed node_modules (NEEDS_REVIEW for lean
 * alternative; tsup-bundle attempt confirmed infeasible — see bn1-bundling.md).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── resolved paths ───────────────────────────────────────────────────────────

const MCP_DIR   = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(MCP_DIR, '..');
const DIST      = join(MCP_DIR, 'dist');

const WEB_SRC            = join(REPO_ROOT, 'ddx-term-web');
const WEB_NEXT_SRC       = join(WEB_SRC, '.next');
const WEB_STANDALONE_SRC = join(WEB_NEXT_SRC, 'standalone');
const WEB_STATIC_SRC     = join(WEB_NEXT_SRC, 'static');
const WEB_SERVER_SRC     = join(WEB_SRC, 'server.mjs');
const WEB_MESSAGES_SRC   = join(WEB_SRC, 'messages');
const WEB_WS_SRC         = join(WEB_SRC, 'node_modules', 'ws');

const BROKER_DIST = join(DIST, 'broker');
const WEB_DIST    = join(DIST, 'web');

// Nested static path (Next.js standalone nests under the project name subdir)
const WEB_STATIC_DEST = join(
  WEB_DIST,
  '.next',
  'standalone',
  'ddx-term-web',
  '.next',
  'static',
);

// ── helpers ──────────────────────────────────────────────────────────────────

/** Ensure directory exists, removing any prior version cleanly. */
function ensureClean(dir) {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

/** Copy src → dest, dereferencing symlinks (resolves pnpm store paths). */
function cp(src, dest, opts = {}) {
  if (!existsSync(src)) {
    throw new Error(`Source not found: ${src}`);
  }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, {
    recursive: true,
    dereference: true,   // resolve pnpm store symlinks
    force: true,
    filter: opts.filter,
  });
}

/** Compute total byte size of a directory recursively. */
function dirSize(dir) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) {
      try {
        const parentPath = entry.parentPath ?? entry.path ?? dir;
        const full = join(parentPath, entry.name);
        total += statSync(full).size;
      } catch {
        // ignore missing entries
      }
    }
  }
  return total;
}

function fmt(bytes) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function step(msg) {
  process.stdout.write(`\n[build:stack] ${msg}\n`);
}

// ── 1. Deploy broker directly to dist/broker/ (pnpm deploy) ──────────────────
//
// pnpm deploy produces: dist/ + node_modules/ with all production deps resolved.
// pnpm uses a .pnpm/ virtual store; top-level entries are symlinks into .pnpm.
// Transitive-only deps (e.g. tslib) live ONLY in .pnpm/ — no top-level alias.
// Node module resolution traverses: <pkg>/node_modules, <parent>/node_modules, etc.
// For the .pnpm virtual store to work, the symlinks must stay intact and resolve
// WITHIN the deployed directory.  We therefore deploy DIRECTLY to dist/broker/
// (not a temp dir) so the relative symlinks (.pnpm/tslib.../node_modules/tslib)
// remain valid.  The workspace back-ref (.pnpm/node_modules/ddx-term-broker →
// ../../../../../../ddx-term-broker) points outside the tarball but is never
// required at runtime (it is pnpm bookkeeping, not a real runtime require).

step('Step 1 — pnpm deploy --legacy --prod directly to dist/broker/');
// pnpm deploy writes the package source AND node_modules to the target dir.
// We need only dist/ + node_modules/ — the src/, tsconfig.json etc. are discarded
// after the deploy by removing those entries.
ensureClean(BROKER_DIST);

try {
  execFileSync('pnpm', ['--filter', 'ddx-term-broker', 'deploy', '--prod', '--legacy', BROKER_DIST], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: false,
  });
} catch (err) {
  throw new Error(
    `pnpm deploy failed: ${err instanceof Error ? err.message : String(err)}\n` +
    'Ensure the broker package builds correctly.',
  );
}

// pnpm deploy copies the entire package source alongside node_modules, including
// the broker's own "dist/" subdir (compiled JS).  We need:
//   dist/broker/main.js         ← was dist/broker/dist/main.js
//   dist/broker/node_modules/   ← stays in place (symlinks intact)
// Strategy: copy each entry from innerDist/* up to BROKER_DIST/, then prune all
// non-runtime artifacts.
const innerDist = join(BROKER_DIST, 'dist');
if (!existsSync(innerDist)) {
  throw new Error(`Expected inner dist/ at ${innerDist} after pnpm deploy — is the broker built?`);
}
// Hoist every entry in inner dist/ up one level (broker's compiled JS is plain CJS)
for (const entry of readdirSync(innerDist, { withFileTypes: true })) {
  const entrySrc  = join(innerDist, entry.name);
  const entryDest = join(BROKER_DIST, entry.name);
  cpSync(entrySrc, entryDest, { recursive: true, dereference: true, force: true });
}
// Remove source artifacts that pnpm deploy copied alongside node_modules:
for (const artifact of ['dist', 'src', 'CLAUDE.md', 'findings', 'tsconfig.json', 'nest-cli.json']) {
  const p = join(BROKER_DIST, artifact);
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}

step('Step 2 — hoisted broker compiled JS to dist/broker/ (main.js at root, symlinks intact in node_modules)');

// ── 3. CJS marker for broker ─────────────────────────────────────────────────
// The MCP package has "type": "module" in its package.json.  Node.js therefore
// treats all .js files under the published bundle as ESM.  The broker dist is
// compiled by SWC/NestJS as CommonJS (uses require(), exports).  We need a
// package.json with "type": "commonjs" inside dist/broker/ so Node picks the
// right module system when it boots dist/broker/main.js.
//
// The compiled main.js also does `require("../package.json")` to read its own
// version (used by Swagger/boot summary). In the original build layout this was
// ddx-term-broker/package.json (one level above ddx-term-broker/dist/main.js).
// After hoisting, main.js lives at dist/broker/main.js, so ../package.json
// resolves to dist/package.json.  We write the broker identity there.

step('Step 3 — write dist/broker/package.json (type: commonjs) + dist/package.json (broker identity)');
const brokerPkgJson = JSON.parse(
  readFileSync(join(REPO_ROOT, 'ddx-term-broker', 'package.json'), 'utf8'),
);
// Write broker identity one level up (dist/package.json) so main.js `../package.json` resolves
writeFileSync(
  join(DIST, 'package.json'),
  JSON.stringify({ name: brokerPkgJson.name, version: brokerPkgJson.version, description: brokerPkgJson.description }, null, 2) + '\n',
);
// Write CJS module-type marker inside dist/broker/ (overrides the MCP "type":"module" scope)
writeFileSync(
  join(BROKER_DIST, 'package.json'),
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
);

// ── 4. Build web output ──────────────────────────────────────────────────────

step('Step 4 — verify Next.js standalone was built');
if (!existsSync(WEB_STANDALONE_SRC)) {
  throw new Error(
    `Next.js standalone not found at ${WEB_STANDALONE_SRC}\n` +
    'Run: pnpm --filter ddx-term-web run build',
  );
}
if (!existsSync(WEB_SERVER_SRC)) {
  throw new Error(`Custom server.mjs not found at ${WEB_SERVER_SRC}`);
}

step('Step 5 — copy web .next/standalone → dist/web/.next/standalone/');
ensureClean(WEB_DIST);

cp(WEB_STANDALONE_SRC, join(WEB_DIST, '.next', 'standalone'));

step('Step 6 — copy .next/static → dist/web/.next/standalone/ddx-term-web/.next/static/ (NESTED path)');
// Next.js standalone output does NOT include static — it must be placed at this
// specific nested path so the server can serve browser assets without 404s.
if (!existsSync(WEB_STATIC_SRC)) {
  throw new Error(
    `Next.js .next/static not found at ${WEB_STATIC_SRC}\n` +
    'Ensure the Next.js build completed successfully.',
  );
}
cp(WEB_STATIC_SRC, WEB_STATIC_DEST);

step('Step 7 — copy custom server.mjs → dist/web/.next/standalone/ddx-term-web/server.mjs');
// server.mjs must live INSIDE the standalone app dir so that:
//   (a) `import next from 'next'` resolves via the sibling node_modules/next symlink
//   (b) next() can find .next/ via __dirname without needing an explicit dir option
// The supervisor's WEB_ENTRY constant already points here.
cp(WEB_SERVER_SRC, join(WEB_DIST, '.next', 'standalone', 'ddx-term-web', 'server.mjs'));

step('Step 8 — copy messages/ (next-intl en/de/fr JSONs) → dist/web/messages/');
if (!existsSync(WEB_MESSAGES_SRC)) {
  throw new Error(`messages/ not found at ${WEB_MESSAGES_SRC}`);
}
cp(WEB_MESSAGES_SRC, join(WEB_DIST, 'messages'));

step('Step 9 — inject ws into dist/web/node_modules/ws (absent from nft trace)');
if (!existsSync(WEB_WS_SRC)) {
  throw new Error(`ws module not found at ${WEB_WS_SRC}`);
}
cp(WEB_WS_SRC, join(WEB_DIST, 'node_modules', 'ws'));

// next is resolved naturally from server.mjs's location inside the standalone app
// dir (sibling node_modules/next) — no manual injection needed.

// ── 5. Size report ───────────────────────────────────────────────────────────

step('Step 10 — size report');

const brokerSize = dirSize(BROKER_DIST);
const webSize    = dirSize(WEB_DIST);
const totalSize  = brokerSize + webSize;

process.stdout.write(
  `  dist/broker: ${fmt(brokerSize)}\n` +
  `  dist/web:    ${fmt(webSize)}\n` +
  `  total:       ${fmt(totalSize)}\n`,
);

// Write measured size to a sidecar for verify-pack.mjs to consume
writeFileSync(
  join(DIST, '.stack-size.json'),
  JSON.stringify({ brokerBytes: brokerSize, webBytes: webSize, totalBytes: totalSize }),
);

step('build:stack complete — dist/broker/main.js + dist/web/server.mjs ready');
