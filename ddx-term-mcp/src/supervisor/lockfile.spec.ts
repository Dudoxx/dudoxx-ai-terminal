/**
 * lockfile.spec.ts — FM#1: O_EXCL lock race, loser detection, stale reclaim.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { acquireLock, reclaimStaleLock, readLock, releaseLock } from './lockfile.js';

const TEST_DIR = join(tmpdir(), 'ddx-lockfile-spec');
mkdirSync(TEST_DIR, { recursive: true });

function tmpLock(): string {
  return join(TEST_DIR, `test-${Math.random().toString(36).slice(2)}.lock`);
}

describe('acquireLock', () => {
  it('returns winner on first call', () => {
    const p = tmpLock();
    try {
      expect(acquireLock(p)).toBe('winner');
    } finally {
      releaseLock(p);
    }
  });

  it('returns loser when file already exists', () => {
    const p = tmpLock();
    acquireLock(p);
    try {
      expect(acquireLock(p)).toBe('loser');
    } finally {
      releaseLock(p);
    }
  });

  it('exactly one winner when two callers race', () => {
    const p = tmpLock();
    const results = [acquireLock(p), acquireLock(p)];
    try {
      expect(results.filter((r) => r === 'winner')).toHaveLength(1);
      expect(results.filter((r) => r === 'loser')).toHaveLength(1);
    } finally {
      releaseLock(p);
    }
  });
});

describe('readLock', () => {
  it('returns undefined when file is absent', () => {
    expect(readLock(join(TEST_DIR, 'nonexistent.lock'))).toBeUndefined();
  });

  it('returns pid and ageMs after acquireLock', () => {
    const p = tmpLock();
    acquireLock(p);
    try {
      const info = readLock(p);
      expect(info).toBeDefined();
      expect(info!.pid).toBe(process.pid);
      expect(info!.ageMs).toBeGreaterThanOrEqual(0);
    } finally {
      releaseLock(p);
    }
  });
});

describe('releaseLock', () => {
  it('removes the lock file', () => {
    const p = tmpLock();
    acquireLock(p);
    releaseLock(p);
    expect(readLock(p)).toBeUndefined();
  });

  it('is idempotent when file already absent', () => {
    const p = tmpLock();
    expect(() => releaseLock(p)).not.toThrow();
  });
});

describe('reclaimStaleLock — dead pid', () => {
  it('reclaims a lock whose pid does not exist', () => {
    const p = tmpLock();
    // Write a lock with a pid virtually guaranteed dead on any normal system.
    writeFileSync(p, '999999999');
    const reclaimed = reclaimStaleLock(p, 60_000);
    expect(reclaimed).toBe(true);
    expect(readLock(p)).toBeUndefined();
  });
});

describe('reclaimStaleLock — age threshold', () => {
  it('reclaims a lock older than staleMs even if pid appears alive', () => {
    const p = tmpLock();
    acquireLock(p); // writes own pid (alive)
    try {
      // Pass staleMs=0 so any lock age qualifies as stale.
      const reclaimed = reclaimStaleLock(p, 0);
      expect(reclaimed).toBe(true);
      expect(readLock(p)).toBeUndefined();
    } finally {
      // releaseLock is safe even if already unlinked.
      releaseLock(p);
    }
  });

  it('does NOT reclaim a fresh lock held by a live pid', () => {
    const p = tmpLock();
    acquireLock(p); // own pid, just acquired → age ~0 ms
    try {
      const reclaimed = reclaimStaleLock(p, 60_000);
      expect(reclaimed).toBe(false);
      expect(readLock(p)).toBeDefined();
    } finally {
      releaseLock(p);
    }
  });
});

describe('reclaimStaleLock — absent file', () => {
  it('returns true when lock file is already gone', () => {
    const p = tmpLock();
    expect(reclaimStaleLock(p, 10_000)).toBe(true);
  });
});
