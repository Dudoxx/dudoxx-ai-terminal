#!/usr/bin/env node
/**
 * verify-pack.mjs — post-build pack manifest assertions for @dudoxx/ddx-term-mcp.
 *
 * Asserts:
 *   1. Required paths are present in the npm pack manifest.
 *   2. Total packed tarball size is within budget (FM#3 — no tarball bloat).
 *
 * Exit 0 = pass. Exit 1 = fail (with diagnostic output).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MCP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── required paths in the pack manifest ─────────────────────────────────────
// These paths MUST appear in the npm pack --dry-run output for the publish to
// be meaningful.  Verified against the supervisor's BROKER_ENTRY / WEB_ENTRY
// constants in src/supervisor/paths.ts.

/** @type {string[]} */
const REQUIRED_PACK_PATHS = [
  'dist/server.js',
  'dist/broker/main.js',
  // server.mjs lives inside the standalone app dir so next resolves from its sibling node_modules
  'dist/web/.next/standalone/ddx-term-web/server.mjs',
  'dist/web/.next/standalone/ddx-term-web/.next/static',
];

// ── size budget ──────────────────────────────────────────────────────────────
// Tuned to the MEASURED stack size produced by build-stack.mjs.
// The broker dist-copy (with pruned node-pty prebuilds) + web standalone totals
// roughly 90-110 MB on disk; npm pack gzip-compresses the tarball, so the pack
// size will be significantly smaller (~30-50 MB in practice for this asset set).
// Budget is set at 250 MB (uncompressed file sum reported by npm pack --json)
// to leave headroom while still catching accidental inclusion of full node_modules.

const BUDGET_BYTES = 250 * 1024 * 1024; // 250 MB

// ── helpers ──────────────────────────────────────────────────────────────────

/** @param {string} msg */
function fail(msg) {
  process.stderr.write(`[verify-pack] FAIL: ${msg}\n`);
  process.exit(1);
}

/** @param {string} msg */
function ok(msg) {
  process.stdout.write(`[verify-pack] OK: ${msg}\n`);
}

/** @param {number} bytes @returns {string} */
function fmt(bytes) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

// ── run npm pack --dry-run --json ─────────────────────────────────────────────

process.stdout.write('[verify-pack] Running npm pack --dry-run --json …\n');

/** @type {string} */
let raw;
try {
  raw = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: MCP_DIR,
    encoding: 'utf8',
    shell: false,
    // Default maxBuffer is 1 MB. The MCP tarball (broker + web standalone) contains
    // thousands of files and the JSON manifest easily exceeds 1 MB. Use 64 MB.
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (err) {
  fail(`npm pack --dry-run failed: ${err instanceof Error ? err.message : String(err)}`);
}

/** @type {unknown} */
let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  fail(`npm pack output is not valid JSON:\n${raw.slice(0, 500)}`);
}

/** @type {Array<{path: string, size: number}>} */
const packData = /** @type {unknown[]} */ (Array.isArray(parsed) ? parsed : [parsed]);
const entry = /** @type {{files?: Array<{path: string, size: number}>}} */ (packData[0]);
const files = entry?.files ?? [];

if (files.length === 0) {
  fail('npm pack reported zero files — package.json files[] may be empty');
}

// ── assert required paths ────────────────────────────────────────────────────

process.stdout.write(`[verify-pack] Checking ${files.length} packed files …\n`);

/** @type {Set<string>} */
const packedPaths = new Set(files.map((f) => f.path));

let pathFail = false;
for (const required of REQUIRED_PACK_PATHS) {
  // npm pack paths may be prefixed with "package/" — normalise.
  const found = [...packedPaths].some(
    (p) => p === required || p === `package/${required}` || p.startsWith(required + '/'),
  );
  if (found) {
    ok(`${required} present`);
  } else {
    process.stderr.write(`[verify-pack] MISSING: ${required}\n`);
    pathFail = true;
  }
}

if (pathFail) {
  fail(
    'One or more required paths are absent from the pack manifest.\n' +
    'Ensure build:stack ran successfully before build:bundle.',
  );
}

// ── assert size budget ────────────────────────────────────────────────────────

const totalBytes = files.reduce((sum, f) => sum + (f.size ?? 0), 0);
process.stdout.write(
  `[verify-pack] Total packed size: ${fmt(totalBytes)} (budget: ${fmt(BUDGET_BYTES)})\n`,
);

if (totalBytes > BUDGET_BYTES) {
  fail(
    `Tarball exceeds ${fmt(BUDGET_BYTES)} budget — ` +
    `actual ${fmt(totalBytes)}.\n` +
    'Check for accidental inclusion of full node_modules (FM#3).\n' +
    'Top 10 largest files:\n' +
    [...files]
      .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
      .slice(0, 10)
      .map((f) => `  ${fmt(f.size ?? 0).padStart(8)}  ${f.path}`)
      .join('\n'),
  );
}

// ── print measured size from .stack-size.json (if present) ───────────────────

const stackSizePath = join(MCP_DIR, 'dist', '.stack-size.json');
if (existsSync(stackSizePath)) {
  try {
    /** @type {{brokerBytes: number, webBytes: number, totalBytes: number}} */
    const sz = JSON.parse(readFileSync(stackSizePath, 'utf8'));
    process.stdout.write(
      `[verify-pack] Stack sizes on disk — broker: ${fmt(sz.brokerBytes)}, ` +
      `web: ${fmt(sz.webBytes)}, total: ${fmt(sz.totalBytes)}\n`,
    );
  } catch {
    // non-fatal
  }
}

ok(`All ${REQUIRED_PACK_PATHS.length} required paths present, size ${fmt(totalBytes)} within ${fmt(BUDGET_BYTES)} budget`);
process.stdout.write('[verify-pack] PASS\n');
