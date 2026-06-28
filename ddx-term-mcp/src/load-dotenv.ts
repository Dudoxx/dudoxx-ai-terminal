/**
 * load-dotenv.ts — layered .env loading for the whole ddx-terminal stack.
 *
 * The MCP server is the machine-wide bootstrap (it spawns the broker + web and
 * passes its `process.env` down to them), so loading dotenv files HERE — before
 * resolvePorts() / ensureStack() run — lets a user override the default 133XX
 * ports and every other DDX_TERM_* setting from a file, without editing the MCP
 * client registration.
 *
 * Precedence (HIGHEST wins). We use `override: false` throughout, so an env var
 * that is ALREADY set always beats a file:
 *   1. The MCP client's `env:` block (per-agent / per-client) — already in
 *      process.env when this runs, so it is never overwritten. HIGHEST.
 *   2. A project-local `.env` in the current working directory.
 *   3. A global `~/.ddx-term/.env` (applies to every client on the machine).
 *
 * This module performs I/O (fs/os), which is exactly why it lives in the MCP
 * package and NOT in @ddx/term-contract (whose contract forbids node built-ins).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { cwd } from 'node:process';

import { config as dotenvConfig } from 'dotenv';

/** Global per-machine env file: `~/.ddx-term/.env`. */
export const GLOBAL_ENV_PATH = join(homedir(), '.ddx-term', '.env');

/**
 * Load `.env` layers into `process.env`, never overriding an already-set var.
 *
 * Loaded in precedence order (project `.env` before the global file) with
 * `override: false`, so the first writer wins per key: an explicit client `env:`
 * value > project `.env` > global `~/.ddx-term/.env` > built-in code default.
 *
 * @returns the absolute paths that were actually found and loaded (for logging).
 */
export function loadDotenv(): string[] {
  const candidates = [join(cwd(), '.env'), GLOBAL_ENV_PATH];
  const loaded: string[] = [];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const result = dotenvConfig({ path, override: false });
    if (result.error === undefined) loaded.push(path);
  }

  return loaded;
}
