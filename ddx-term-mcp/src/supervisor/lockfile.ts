/**
 * lockfile.ts — O_EXCL-based exclusive lock for supervisor singletons.
 *
 * Lock files live at BROKER_LOCK_PATH / WEB_LOCK_PATH.  Each lock file stores
 * the pid of the winning process as a decimal string.  Operations:
 *
 *   acquireLock  — openSync('wx') O_EXCL; writes own pid; returns 'winner'.
 *                  If the file already exists returns 'loser'.
 *   releaseLock  — unlinks the lock file; safe to call if already absent.
 *   readLock     — parses the pid from an existing lock file.
 *   reclaimStaleLock — removes a lock whose holder is dead (ESRCH) or old (>staleMs).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { openSync, closeSync, unlinkSync, readFileSync, writeFileSync, statSync } from 'node:fs';

/** Result of an acquireLock attempt. */
export type AcquireResult = 'winner' | 'loser';

/** Parsed contents of a live lock file. */
export interface LockInfo {
  readonly pid: number;
  readonly ageMs: number;
}

/**
 * Try to acquire the exclusive lock at `lockPath`.
 *
 * Uses openSync with flag 'wx' which maps to O_WRONLY|O_CREAT|O_EXCL — the
 * create-and-fail-if-exists is atomic at the kernel level.  The winner writes
 * its pid into the file so losers can detect a dead holder.
 *
 * @returns 'winner' when this process acquired the lock, 'loser' when another
 *   process already holds it.
 */
export function acquireLock(lockPath: string): AcquireResult {
  try {
    const fd = openSync(lockPath, 'wx');
    writeFileSync(fd, String(process.pid));
    closeSync(fd);
    return 'winner';
  } catch (err: unknown) {
    if (isEexist(err)) return 'loser';
    throw err;
  }
}

/**
 * Release the lock at `lockPath` by removing the file.
 * Safe to call when the file is already absent.
 */
export function releaseLock(lockPath: string): void {
  try {
    unlinkSync(lockPath);
  } catch (err: unknown) {
    if (!isEnoent(err)) throw err;
  }
}

/**
 * Read and parse the pid from an existing lock file.
 *
 * @returns LockInfo when the file exists and contains a valid pid, or
 *   `undefined` when the file is absent or unparseable.
 */
export function readLock(lockPath: string): LockInfo | undefined {
  try {
    const raw = readFileSync(lockPath, 'utf8').trim();
    const pid = Number.parseInt(raw, 10);
    if (!Number.isFinite(pid) || pid <= 0) return undefined;
    const stat = statSync(lockPath);
    // Math.max guards against sub-millisecond filesystem clock skew where
    // mtime can appear fractionally ahead of Date.now().
    const ageMs = Math.max(0, Date.now() - stat.mtimeMs);
    return { pid, ageMs };
  } catch (err: unknown) {
    if (isEnoent(err)) return undefined;
    throw err;
  }
}

/**
 * Reclaim a stale lock — remove it when the holder's pid is dead (ESRCH from
 * process.kill(pid, 0)) or the lock is older than `staleMs` milliseconds.
 *
 * After reclaiming, the caller should retry `acquireLock` to become the winner.
 *
 * @returns `true` when the lock was reclaimed, `false` when the holder is still
 *   alive and the lock is fresh.
 */
export function reclaimStaleLock(lockPath: string, staleMs = 10_000): boolean {
  const info = readLock(lockPath);
  if (info === undefined) {
    // File is gone already — treat as reclaimed.
    return true;
  }

  const holderDead = !isPidAlive(info.pid);
  const tooOld = info.ageMs >= staleMs;

  if (holderDead || tooOld) {
    releaseLock(lockPath);
    return true;
  }

  return false;
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** Test whether a pid is alive by sending signal 0. */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    // ESRCH = no such process; EPERM = exists but not owned by us (still alive).
    if (isEsrch(err)) return false;
    return true;
  }
}

function isEexist(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EEXIST';
}

function isEnoent(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
}

function isEsrch(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ESRCH';
}
