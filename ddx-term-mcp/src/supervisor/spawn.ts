/**
 * spawn.ts — detached child-process launcher for broker and web.
 *
 * Uses child_process.spawn(process.execPath, [entry], { detached, stdio:'ignore' })
 * + unref() so the spawned process outlives the MCP server process.  NO shell
 * string, NO pseudo-terminal library — no-pty.spec.ts greps the source tree and must stay green.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { spawn } from 'node:child_process';

/** Which service is being spawned — used for log attribution. */
export type SpawnKind = 'broker' | 'web';

/** Injected spawn surface — real impl delegates to child_process.spawn. */
export interface SpawnFn {
  (kind: SpawnKind, entry: string, env: NodeJS.ProcessEnv): void;
}

/**
 * Spawn a detached Node.js process for the given entry script.
 *
 * The child inherits the supplied `env` map (never the raw process.env — callers
 * compose it with any extra vars before passing it in).  stdio is 'ignore' so
 * the child does not hold the parent's stdio fds open.  unref() lets the MCP
 * process exit without waiting for the child.
 */
export function spawnDetached(kind: SpawnKind, entry: string, env: NodeJS.ProcessEnv): void {
  const child = spawn(process.execPath, [entry], {
    detached: true,
    stdio: 'ignore',
    env,
  });
  child.unref();
  process.stderr.write(`[ddx-term-mcp] spawned ${kind} (entry=${entry} pid=${child.pid ?? '?'})\n`);
}

/** Default SpawnFn backed by the real spawnDetached. */
export const defaultSpawnFn: SpawnFn = spawnDetached;
