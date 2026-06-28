/**
 * global-tmux-sweep.ts — vitest globalSetup safety net against tmux pty leaks.
 *
 * WHY: each e2e suite boots a throwaway tmux server on a private socket and tears
 * it down in afterAll (see tmux-sandbox.ts). But afterAll does NOT run when the
 * vitest process is interrupted (Ctrl-C, watch restart, OS timeout-kill, or a
 * beforeAll throwing after newSession() but before its afterAll is in effect).
 * Each surviving tmux server keeps a child shell alive holding a pty; across many
 * aborted runs these accumulate until macOS exhausts kern.tty.ptmx_max (511) and
 * NO new pty can be allocated — Ghostty/tmux then fail with "Device not
 * configured". Observed in the wild: 14 orphaned `ddx-e2e` servers draining the
 * pool (2026-06-28).
 *
 * This globalSetup:
 *   - sweeps any PRE-EXISTING `ddx-e2e` tmux servers before the run (cleans up a
 *     prior crashed run so a fresh run doesn't compound the leak)
 *   - returns a teardown that sweeps again after the run — a process-level net
 *     under the per-suite afterAll hooks, catching servers whose afterAll was
 *     skipped because the suite errored.
 *
 * It targets ONLY processes whose command line contains the `ddx-e2e` marker
 * (every TmuxSandbox names its session `ddx-e2e-*` and its socket dir
 * `ddx-e2e-*`), so it never touches the user's own tmux sessions or the broker's
 * `ddx-shared` session.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { execFileSync } from 'node:child_process';

/** Marker present in every e2e tmux session name + socket dir (see tmux-sandbox.ts). */
const E2E_MARKER = 'ddx-e2e';

/**
 * Find PIDs of tmux server processes spawned by the e2e harness.
 * Matches the marker in the full command line (session name + socket path both
 * carry it), never the user's tmux or the broker's `ddx-shared` server.
 */
function findLeakedTmuxPids(): number[] {
  let out = '';
  try {
    // `ps -ax -o pid=,command=` → "  PID  full command line", one per line.
    out = execFileSync('ps', ['-ax', '-o', 'pid=,command='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return [];
  }

  const pids: number[] = [];
  for (const line of out.split('\n')) {
    // Only real tmux server processes: command path ends in `tmux` and the line
    // carries the e2e marker. Exclude this sweep's own `ps`/grep-like noise by
    // requiring the literal "tmux" binary token followed by tmux args.
    if (!line.includes(E2E_MARKER)) continue;
    if (!/\btmux\b/.test(line)) continue;
    const m = line.match(/^\s*(\d+)\s/);
    if (!m || !m[1]) continue;
    pids.push(Number.parseInt(m[1], 10));
  }
  return pids;
}

/** Kill the given PIDs (TERM then KILL). Best-effort — never throws. */
function killPids(pids: readonly number[]): number {
  let killed = 0;
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
      killed += 1;
    } catch {
      // already gone / not ours
    }
  }
  // Escalate any survivors after a short grace period.
  if (killed > 0) {
    const deadline = Date.now() + 1000;
    while (Date.now() < deadline) { /* brief spin so SIGTERM can land */ }
    for (const pid of pids) {
      try {
        process.kill(pid, 0); // probe — throws if gone
        process.kill(pid, 'SIGKILL');
      } catch {
        // gone — good
      }
    }
  }
  return killed;
}

/** Sweep leaked e2e tmux servers; returns how many were signalled. */
function sweep(label: string): number {
  const pids = findLeakedTmuxPids();
  if (pids.length === 0) return 0;
  const n = killPids(pids);
  console.warn(`[e2e tmux sweep:${label}] reaped ${n} leaked ddx-e2e tmux server(s): ${pids.join(', ')}`);
  return n;
}

/** vitest globalSetup entry — runs once before all suites; returns teardown. */
export default function setup(): () => void {
  sweep('pre-run');
  return () => {
    sweep('post-run');
  };
}
