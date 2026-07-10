/**
 * control-mode.attach.spec.ts — pty-master lifecycle regression.
 *
 * Guards the fix for the PTY-pool exhaustion bug: a stale broker held 510
 * `/dev/ptmx` masters and killed `zpty`/shell autosuggest host-wide. Root cause
 * was the success→exit→reconnect churn — each exited node-pty was dropped
 * (`this.proc = null`) but never `.kill()`d, so its master fd leaked one per
 * cycle. The failure-cap (RECONNECT_MAX_ATTEMPTS=60) never tripped because a
 * healthy data frame reset the counter to 0.
 *
 * These tests model node-pty as fake IPty objects tracking a shared live-master
 * counter; the load-bearing invariant is `liveMasters <= 1` across an arbitrary
 * reconnect churn. Before the fix the counter climbs unbounded.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import type { IPty } from 'node-pty';

/** Shared count of un-killed pty masters — the thing that must never leak. */
let liveMasters = 0;
/** Every fake pty ever spawned, in order, so a test can drive its lifecycle. */
let spawned: FakePty[] = [];

interface ExitListener {
  (e: { exitCode: number; signal?: number }): void;
}
interface DataListener {
  (chunk: string): void;
}

class FakePty {
  killed = false;
  private exitCb: ExitListener | null = null;
  private dataCb: DataListener | null = null;

  constructor() {
    liveMasters += 1;
  }

  onExit(cb: ExitListener): { dispose(): void } {
    this.exitCb = cb;
    return { dispose: () => {} };
  }

  onData(cb: DataListener): { dispose(): void } {
    this.dataCb = cb;
    return { dispose: () => {} };
  }

  kill(): void {
    if (this.killed) {
      // Mirror node-pty: killing an already-dead pty throws (EBADF/ESRCH).
      throw new Error('kill EBADF');
    }
    this.killed = true;
    liveMasters -= 1;
  }

  /** Simulate the OS delivering an exit for this attach. */
  fireExit(exitCode = 0): void {
    // node-pty fires onExit for the process; the master fd is NOT auto-released.
    this.exitCb?.({ exitCode });
  }

  /** Simulate a healthy control-mode data frame (resets the failure counter). */
  fireData(chunk = '%begin 1 1\n'): void {
    this.dataCb?.(chunk);
  }
}

// node-pty must be mocked BEFORE the SUT imports it.
jest.mock('node-pty', () => ({
  spawn: jest.fn((): IPty => {
    const p = new FakePty();
    spawned.push(p);
    return p as unknown as IPty;
  }),
}));

import { ControlModeAttach } from './control-mode.attach';
import type { FrameResolvers } from './control-mode.parser';

const noopResolvers: FrameResolvers = {
  resolvePane: () => undefined,
  resolveWindow: () => undefined,
};

describe('ControlModeAttach — pty master lifecycle (leak regression)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    liveMasters = 0;
    spawned = [];
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('holds at most ONE pty master across a success→exit→reconnect churn', () => {
    const attach = new ControlModeAttach();
    attach.start(noopResolvers, () => {});

    expect(spawned).toHaveLength(1);
    expect(liveMasters).toBe(1);

    // Drive 100 healthy-then-exited reconnect cycles — the exact churn that
    // accumulated 510 leaked masters over 11 days. A data frame each cycle
    // resets failedAttempts, so the 60-cap never engages.
    for (let cycle = 0; cycle < 100; cycle += 1) {
      const current = spawned[spawned.length - 1];
      current.fireData(); // healthy frame → failedAttempts = 0
      current.fireExit(0); // tmux -CC drops → schedules a reconnect
      jest.runOnlyPendingTimers(); // fast-forward the backoff timer → spawn()

      // INVARIANT: never more than the single live attach.
      expect(liveMasters).toBeLessThanOrEqual(1);
    }

    // 100 cycles produced 100 reconnect spawns + the initial = 101 total,
    // but exactly ONE remains live and 100 masters were released.
    expect(spawned.length).toBeGreaterThanOrEqual(100);
    expect(liveMasters).toBe(1);
    const killed = spawned.filter((p) => p.killed).length;
    expect(killed).toBe(spawned.length - 1);

    attach.stop();
    expect(liveMasters).toBe(0);
  });

  it('releases the master on stop() (module destroy)', () => {
    const attach = new ControlModeAttach();
    attach.start(noopResolvers, () => {});
    expect(liveMasters).toBe(1);

    attach.stop();
    expect(liveMasters).toBe(0);
    expect(spawned[0].killed).toBe(true);
  });

  it('does not re-spawn after stop() even if an exit races in', () => {
    const attach = new ControlModeAttach();
    attach.start(noopResolvers, () => {});
    const first = spawned[0];

    attach.stop(); // sets stopped=true, kills the proc
    first.fireExit(0); // a late exit event arrives after stop
    jest.runOnlyPendingTimers();

    // No new pty allocated; nothing leaked.
    expect(spawned).toHaveLength(1);
    expect(liveMasters).toBe(0);
  });
});
