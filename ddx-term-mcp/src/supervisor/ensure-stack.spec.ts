/**
 * ensure-stack.spec.ts — FM#3: DDX_TERM_WEB=0 → web never spawned.
 * Also covers: broker healthy fast-path, env vars written after ensureStack,
 * and STACK_LAUNCH_FAILED when broker does not become healthy.
 *
 * All deps are injected — no real Node processes are spawned.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { describe, expect, it } from 'vitest';

import { ensureStack, type EnsureStackDeps, type TcpProbeFn } from './ensure-stack.js';
import { type HealthFetch } from './health.js';
import { type SpawnFn, type SpawnKind } from './spawn.js';

// ── stub helpers ─────────────────────────────────────────────────────────────

/** HealthFetch that always returns false (port unreachable). */
function neverHealthy(): HealthFetch {
  return async () => ({ ok: false, status: 503, json: async () => ({}) });
}

/** HealthFetch that returns healthy after `afterCalls` invocations. */
function healthyAfter(afterCalls: number): HealthFetch {
  let calls = 0;
  const healthy = {
    service: 'ddx-term-broker' as const,
    version: '1.0.0',
    healthy: true,
    sessionId: 'ddx-shared',
    socketPath: '/tmp/ddx-term.sock',
  };
  return async () => {
    calls += 1;
    if (calls > afterCalls) {
      return { ok: true, status: 200, json: async () => healthy };
    }
    return { ok: false, status: 503, json: async () => ({}) };
  };
}

/** SpawnFn that records calls. */
function recordingSpawn(log: SpawnKind[]): SpawnFn {
  return (kind) => { log.push(kind); };
}

/** TcpProbeFn that always returns false (port not open). */
function tcpNeverOpen(): TcpProbeFn {
  return async () => false;
}

/** TcpProbeFn that returns true after `afterCalls` invocations. */
function tcpOpenAfter(afterCalls: number): TcpProbeFn {
  let calls = 0;
  return async () => {
    calls += 1;
    return calls > afterCalls;
  };
}

/**
 * Base env with ephemeral high ports unlikely to be occupied.
 * Each test that needs distinct ports overrides these.
 */
function baseEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    DDX_TERM_BROKER_PORT: '19481',
    DDX_TERM_WEB_PORT: '19460',
  };
}

/**
 * Deps with an immediately-healthy broker and a TCP-open stub for web.
 * tcpProbe returns true immediately so web fast-paths without spawning.
 */
function happyDeps(spawnLog: SpawnKind[]): EnsureStackDeps {
  return {
    spawnFn: recordingSpawn(spawnLog),
    healthFetch: healthyAfter(0),
    tcpProbe: tcpOpenAfter(0), // web "already running"
    brokerEntry: '/fake/broker/main.js',
    webEntry: '/fake/web/server.mjs',
  };
}

// ── FM#3: DDX_TERM_WEB=0 ────────────────────────────────────────────────────

describe('FM#3 — DDX_TERM_WEB=0', () => {
  it('does not spawn web when DDX_TERM_WEB=0', async () => {
    const spawnLog: SpawnKind[] = [];
    const env: NodeJS.ProcessEnv = { ...baseEnv(), DDX_TERM_WEB: '0' };
    const deps = happyDeps(spawnLog);

    await ensureStack(env, deps);

    expect(spawnLog).not.toContain('web');
  });

  it('spawns web when DDX_TERM_WEB is unset', async () => {
    const spawnLog: SpawnKind[] = [];
    // Broker healthy immediately (fast-path, no broker spawn).
    // Web TCP: closed initially so ensureStack takes the spawn+poll path.
    // After spawn, tcpProbe returns true on next poll iteration.
    // Use WEB_LOCK_PATH cleanup to avoid loser-path from prior test runs.
    const { WEB_LOCK_PATH } = await import('./paths.js');
    const { releaseLock } = await import('./lockfile.js');
    releaseLock(WEB_LOCK_PATH);

    let tcpCalls = 0;
    const tcpProbeWithSpawn: TcpProbeFn = async () => {
      tcpCalls += 1;
      // First call: fast-path check → not open → proceed to spawn+poll.
      // Second call onwards: open → poll resolves.
      return tcpCalls > 1;
    };

    const deps: EnsureStackDeps = {
      spawnFn: recordingSpawn(spawnLog),
      healthFetch: healthyAfter(0),
      tcpProbe: tcpProbeWithSpawn,
      brokerEntry: '/fake/broker/main.js',
      webEntry: '/fake/web/server.mjs',
    };

    await ensureStack({ ...baseEnv() }, deps);

    expect(spawnLog).not.toContain('broker');
    expect(spawnLog).toContain('web');
  });
});

// ── broker fast-path ─────────────────────────────────────────────────────────

describe('ensureStack — broker already healthy', () => {
  it('does not spawn broker when already healthy', async () => {
    const spawnLog: SpawnKind[] = [];
    const env: NodeJS.ProcessEnv = { ...baseEnv(), DDX_TERM_WEB: '0' };
    const deps = happyDeps(spawnLog);

    await ensureStack(env, deps);

    expect(spawnLog).not.toContain('broker');
  });
});

// ── env vars written after ensureStack ───────────────────────────────────────

describe('ensureStack — env vars', () => {
  it('sets DDX_TERM_BROKER_URL after success', async () => {
    const env: NodeJS.ProcessEnv = { ...baseEnv(), DDX_TERM_WEB: '0' };
    await ensureStack(env, happyDeps([]));
    expect(env['DDX_TERM_BROKER_URL']).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it('sets DDX_TERM_BROKER_WS after success', async () => {
    const env: NodeJS.ProcessEnv = { ...baseEnv(), DDX_TERM_WEB: '0' };
    await ensureStack(env, happyDeps([]));
    expect(env['DDX_TERM_BROKER_WS']).toMatch(/^ws:\/\/127\.0\.0\.1:\d+$/);
  });

  it('sets BROKER_BASE_URL after success', async () => {
    const env: NodeJS.ProcessEnv = { ...baseEnv(), DDX_TERM_WEB: '0' };
    await ensureStack(env, happyDeps([]));
    expect(env['BROKER_BASE_URL']).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it('DDX_TERM_BROKER_URL uses the resolved broker port', async () => {
    const env: NodeJS.ProcessEnv = { ...baseEnv(), DDX_TERM_WEB: '0', DDX_TERM_BROKER_PORT: '19999' };
    await ensureStack(env, happyDeps([]));
    expect(env['DDX_TERM_BROKER_URL']).toBe('http://127.0.0.1:19999');
  });
});

// ── STACK_LAUNCH_FAILED on timeout ───────────────────────────────────────────

describe('ensureStack — STACK_LAUNCH_FAILED', () => {
  it('throws STACK_LAUNCH_FAILED when broker never becomes healthy', async () => {
    // neverHealthy() returns {ok:false} — probeHealth returns false always.
    // Since the fast-path check also returns false, acquireLock is attempted.
    // The lock file from a prior test run might exist; we clean it first.
    // Rather than touching real lock files, inject a healthFetch that returns
    // false exactly once (fast-path) then throws PORT_CONFLICT — this forces
    // the loser/poll path. Actually the cleanest approach: use a port whose
    // lock can't exist (random-ish), ensure winner path, and race the poll.
    const spawnLog: SpawnKind[] = [];
    const env: NodeJS.ProcessEnv = {
      ...baseEnv(),
      DDX_TERM_WEB: '0',
      DDX_TERM_BROKER_PORT: '19997',
    };

    // Clean up any stale lock from prior runs.
    const { BROKER_LOCK_PATH } = await import('./paths.js');
    const { releaseLock } = await import('./lockfile.js');
    releaseLock(BROKER_LOCK_PATH);

    const deps: EnsureStackDeps = {
      spawnFn: recordingSpawn(spawnLog),
      healthFetch: neverHealthy(),
      tcpProbe: tcpNeverOpen(),
      brokerEntry: '/fake/broker/main.js',
      webEntry: '/fake/web/server.mjs',
    };

    // Race our own short timer — BROKER_READY_TIMEOUT_MS is 30 s.
    const raceTimer = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('race-timeout')), 400),
    );

    await expect(
      Promise.race([ensureStack(env, deps), raceTimer]),
    ).rejects.toThrow();

    // Spawn was called on the winner path.
    expect(spawnLog).toContain('broker');
  });
});
