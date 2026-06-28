/**
 * ensure-stack.ts — machine-wide singleton stack bootstrap.
 *
 * On the first term_* verb call, ensureStack guarantees that:
 *   1. ddx-term-broker is live on its port (spawn if needed, lock-protected).
 *   2. ddx-term-web is live (unless DDX_TERM_WEB=0).
 *   3. DDX_TERM_BROKER_URL + DDX_TERM_BROKER_WS + BROKER_BASE_URL are set in
 *      process.env so that buildResolver() picks BrokerRestResolver.
 *
 * Three failure modes implemented:
 *   FM#1 — lock race: O_EXCL winner spawns; loser polls health.
 *           Stale lock (dead pid or age>10 s) is reclaimed before retry.
 *   FM#2 — zombie/port-conflict: probeHealth validates BrokerHealthSchema;
 *           foreign process on port → PORT_CONFLICT, never silent-attach.
 *   FM#3 — web opt-out: DDX_TERM_WEB=0 → web never spawned.
 *
 * Deps (spawn, probe, lock fns) are injected for testability so specs never
 * actually spawn a Node process.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import {
  DEFAULT_BROKER_PORT,
  resolvePorts,
} from '@ddx/term-contract';

import { TermError } from '../errors.js';
import { type HealthFetch, defaultHealthFetch, probeHealth } from './health.js';
import {
  BROKER_ENTRY,
  BROKER_LOCK_PATH,
  WEB_ENTRY,
  WEB_LOCK_PATH,
} from './paths.js';
import {
  acquireLock,
  reclaimStaleLock,
  releaseLock,
} from './lockfile.js';
import { type SpawnFn, defaultSpawnFn } from './spawn.js';

// ── tunables ────────────────────────────────────────────────────────────────

/** How long to wait for the broker to become healthy after spawning (ms). */
const BROKER_READY_TIMEOUT_MS = 30_000;

/** How long to wait for the web server TCP port after spawning (ms). */
const WEB_READY_TIMEOUT_MS = 20_000;

/** Poll interval while waiting for a service to become ready (ms). */
const POLL_INTERVAL_MS = 300;

/** Age threshold for stale lock reclamation (ms). */
const STALE_LOCK_MS = 10_000;

// ── injectable deps ─────────────────────────────────────────────────────────

/** Injectable TCP reachability check — returns true when port is open. */
export type TcpProbeFn = (host: string, port: number) => Promise<boolean>;

/** Injected dependencies — replace in tests to avoid real spawning/fetching. */
export interface EnsureStackDeps {
  spawnFn: SpawnFn;
  healthFetch: HealthFetch;
  /** TCP probe for web port readiness (default: real isTcpOpen). */
  tcpProbe: TcpProbeFn;
  /** Resolve entry path for broker (default: BROKER_ENTRY constant). */
  brokerEntry: string;
  /** Resolve entry path for web (default: WEB_ENTRY constant). */
  webEntry: string;
}

const DEFAULT_DEPS: EnsureStackDeps = {
  spawnFn: defaultSpawnFn,
  healthFetch: defaultHealthFetch,
  tcpProbe: isTcpOpen,
  brokerEntry: BROKER_ENTRY,
  webEntry: WEB_ENTRY,
};

// ── public API ───────────────────────────────────────────────────────────────

/**
 * Ensure broker (and optionally web) are live, writing env vars on success.
 *
 * Safe to call multiple times — the memoised wrapper in server.ts calls this
 * exactly once per process lifetime.  Do NOT call at stdio connect — only on
 * first verb dispatch.
 */
export async function ensureStack(
  env: NodeJS.ProcessEnv,
  deps: EnsureStackDeps = DEFAULT_DEPS,
): Promise<void> {
  const ports = resolvePorts(env);

  await ensureBroker(ports.brokerPort, ports.host, env, deps);

  if (env['DDX_TERM_WEB'] !== '0') {
    await ensureWeb(ports.webPort, ports.host, env, deps);
  }

  // Write the MCP-side env vars AFTER both services are confirmed live.
  const brokerBase = `http://${ports.host}:${ports.brokerPort}`;
  const brokerWs = `ws://${ports.host}:${ports.brokerPort}`;

  env['DDX_TERM_BROKER_URL'] = brokerBase;
  // Web child reads DDX_TERM_BROKER_WS (NestJS WS URL) and BROKER_BASE_URL
  // (Next.js rewrites) — distinct from DDX_TERM_BROKER_URL (MCP-side REST).
  env['DDX_TERM_BROKER_WS'] = brokerWs;
  env['BROKER_BASE_URL'] = brokerBase;

  process.stderr.write(
    `[ddx-term-mcp] stack ready. broker=${brokerBase} web-port=${ports.webPort}\n`,
  );
}

// ── broker bootstrap ─────────────────────────────────────────────────────────

async function ensureBroker(
  brokerPort: number,
  host: string,
  env: NodeJS.ProcessEnv,
  deps: EnsureStackDeps,
): Promise<void> {
  // Fast path: already healthy (another process started it before us).
  if (await probeHealth(brokerPort, deps.healthFetch)) return;

  const result = acquireLock(BROKER_LOCK_PATH);

  if (result === 'loser') {
    // Another process is spawning — wait for it to finish.
    await pollUntilHealthy(brokerPort, BROKER_READY_TIMEOUT_MS, deps.healthFetch, 'broker');
    return;
  }

  // We are the lock winner — spawn and wait.
  try {
    // Build broker child env: inherit current env + port override.
    const brokerEnv: NodeJS.ProcessEnv = {
      ...env,
      DDX_TERM_BROKER_PORT: String(brokerPort),
      DDX_TERM_HOST: host,
    };

    deps.spawnFn('broker', deps.brokerEntry, brokerEnv);

    await pollUntilHealthy(brokerPort, BROKER_READY_TIMEOUT_MS, deps.healthFetch, 'broker');
  } catch (err: unknown) {
    releaseLock(BROKER_LOCK_PATH);
    throw err;
  }

  // Keep the lock for the lifetime of the MCP process so losers know it's live.
  // releaseLock is NOT called here — OS cleans up on process exit.
}

// ── web bootstrap ────────────────────────────────────────────────────────────

async function ensureWeb(
  webPort: number,
  host: string,
  env: NodeJS.ProcessEnv,
  deps: EnsureStackDeps,
): Promise<void> {
  // Fast path: TCP port already open (web already running).
  if (await deps.tcpProbe(host, webPort)) return;

  const result = acquireLock(WEB_LOCK_PATH);

  if (result === 'loser') {
    await pollUntilTcpOpen(host, webPort, WEB_READY_TIMEOUT_MS, 'web', deps.tcpProbe);
    return;
  }

  try {
    // Web child env: broker connection vars + port override.
    const brokerBase = `http://${host}:${env['DDX_TERM_BROKER_PORT'] ?? DEFAULT_BROKER_PORT}`;
    const brokerWs = `ws://${host}:${env['DDX_TERM_BROKER_PORT'] ?? DEFAULT_BROKER_PORT}`;

    const webEnv: NodeJS.ProcessEnv = {
      ...env,
      PORT: String(webPort),
      DDX_TERM_WEB_PORT: String(webPort),
      // Web server reads these two vars — NOT DDX_TERM_BROKER_URL.
      DDX_TERM_BROKER_WS: brokerWs,
      BROKER_BASE_URL: brokerBase,
    };

    deps.spawnFn('web', deps.webEntry, webEnv);

    await pollUntilTcpOpen(host, webPort, WEB_READY_TIMEOUT_MS, 'web', deps.tcpProbe);
  } catch (err: unknown) {
    releaseLock(WEB_LOCK_PATH);
    throw err;
  }
}

// ── poll helpers ─────────────────────────────────────────────────────────────

async function pollUntilHealthy(
  brokerPort: number,
  timeoutMs: number,
  fetchImpl: HealthFetch,
  label: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    // probeHealth throws PORT_CONFLICT on a foreign body — let that propagate.
    const healthy = await probeHealth(brokerPort, fetchImpl);
    if (healthy) return;

    // Check for stale lock (loser path): if holder died, reclaim and re-enter.
    if (reclaimStaleLock(BROKER_LOCK_PATH, STALE_LOCK_MS)) {
      // Lock was stale — retry broker bootstrap at the call site is not
      // straightforward here, so surface a clear error so the caller can retry.
      throw new TermError(
        'STACK_LAUNCH_FAILED',
        `${label} lock was stale and reclaimed — retry the operation`,
      );
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new TermError(
    'STACK_LAUNCH_FAILED',
    `${label} did not become healthy within ${timeoutMs}ms`,
  );
}

async function pollUntilTcpOpen(
  host: string,
  port: number,
  timeoutMs: number,
  label: string,
  tcpProbe: TcpProbeFn,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await tcpProbe(host, port)) return;
    await sleep(POLL_INTERVAL_MS);
  }

  throw new TermError(
    'STACK_LAUNCH_FAILED',
    `${label} TCP port ${port} did not open within ${timeoutMs}ms`,
  );
}

/** Non-blocking TCP reachability check via a short-lived connection attempt. */
async function isTcpOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    // Use dynamic import to avoid top-level net import in ESM bundle checks.
    import('node:net').then(({ createConnection }) => {
      const socket = createConnection({ host, port });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => { socket.destroy(); resolve(false); });
    }).catch(() => resolve(false));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
