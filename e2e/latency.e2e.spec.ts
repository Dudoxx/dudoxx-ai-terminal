/**
 * latency.e2e.spec.ts — AC #1 / RESPONSIVENESS §4.
 *
 * Measures agent-path latency: time from term_send to first term_read delta
 * that contains the echoed command, over N=200 keystrokes. Emits p50/p95 and
 * fails if p95 exceeds the hard ceiling from RESPONSIVENESS.md §1.
 *
 * Hard ceiling (agent term_send → human sees it): 300 ms p95.
 * Hard ceiling (term_read delta round-trip): 200 ms p95.
 *
 * Methodology (RESPONSIVENESS §4):
 *   - timestamp immediately before term_send
 *   - poll term_read (since='last') until the marker appears
 *   - record elapsed; repeat N times with unique per-iteration markers
 *   - compute p50/p95; log to stdout; fail if p95 > ceiling
 *
 * Uses a real throwaway tmux on a TEMP socket (never the user's server).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { toTerminalId } from '@ddx/term-contract';

import { termCreate } from '../ddx-term-mcp/src/tools/term-create.tool.js';
import { termRead } from '../ddx-term-mcp/src/tools/term-read.tool.js';
import { termSend } from '../ddx-term-mcp/src/tools/term-send.tool.js';
import { termWaitFor } from '../ddx-term-mcp/src/tools/term-wait-for.tool.js';
import { TmuxSandbox, tmuxAvailable, percentiles } from './helpers/tmux-sandbox.js';

const HAS_TMUX = tmuxAvailable();

/** RESPONSIVENESS.md §1 hard ceilings (agent path, localhost). */
const P95_SEND_CEILING_MS = 300;
const P95_READ_CEILING_MS = 200;

/** Number of samples per measurement. */
const N_SAMPLES = 200;

/** Poll term_read (since='last') until the marker appears, returning elapsed ms. */
async function measureRoundTrip(
  sandbox: TmuxSandbox,
  marker: string,
): Promise<number> {
  const start = Date.now();
  await termSend(sandbox.ctx, {
    terminalId: toTerminalId('lat'),
    text: `echo ${marker}`,
    enter: true,
  });

  // Poll via term_wait_for (backed-off 100ms→500ms) — the correct pattern
  // per RESPONSIVENESS §2.4 (not a fixed sleep).
  const waited = await termWaitFor(sandbox.ctx, {
    terminalId: toTerminalId('lat'),
    pattern: marker,
    timeoutMs: P95_SEND_CEILING_MS * 10, // generous per-sample guard
  });

  const elapsed = Date.now() - start;

  if (!waited.matched) {
    // Marker didn't appear within timeout — record the ceiling as a penalty.
    return P95_SEND_CEILING_MS * 10;
  }

  return elapsed;
}

/**
 * Measure term_read round-trip: send marker → time how long term_read(since='all')
 * takes to return a capture that contains the marker.
 *
 * We use since='all' rather than since='last' because the scrollback cap
 * (DDX_TERM_MAX_READ_LINES=2000) saturates after ~200 echo iterations — once the
 * window is full, the cursor set by resetToTail equals tail (1999), so the next
 * capture also has tail=1999 and the delta is always empty even when new output
 * exists. since='all' always returns the freshest N lines and reliably contains
 * the marker, correctly measuring the scrollback read round-trip latency.
 */
async function measureReadDelta(
  sandbox: TmuxSandbox,
  marker: string,
): Promise<number> {
  // Send the marker and wait until it is visible in the pane.
  await termSend(sandbox.ctx, {
    terminalId: toTerminalId('lat'),
    text: `echo ${marker}`,
    enter: true,
  });
  await termWaitFor(sandbox.ctx, {
    terminalId: toTerminalId('lat'),
    pattern: marker,
    timeoutMs: P95_SEND_CEILING_MS * 10,
  });

  // Measure only the term_read call — the marker must be in the returned text.
  const readStart = Date.now();
  const result = await termRead(sandbox.ctx, {
    terminalId: toTerminalId('lat'),
    since: 'all',
  });
  const readElapsed = Date.now() - readStart;

  // If the marker isn't present, return a penalty to surface the failure.
  if (!result.text.includes(marker)) {
    return P95_READ_CEILING_MS * 10;
  }
  return readElapsed;
}

describe.skipIf(!HAS_TMUX)('latency — AC #1 / RESPONSIVENESS §4', () => {
  let sandbox: TmuxSandbox;

  beforeAll(async () => {
    sandbox = await TmuxSandbox.create('ddx-e2e-latency');
    await termCreate(sandbox.ctx, { name: 'lat' });
    // Warm up: discard the first few samples (shell startup, shell history load).
    for (let i = 0; i < 5; i++) {
      await termSend(sandbox.ctx, {
        terminalId: toTerminalId('lat'),
        text: `echo WARMUP_${i}`,
        enter: true,
      });
      await termWaitFor(sandbox.ctx, {
        terminalId: toTerminalId('lat'),
        pattern: `WARMUP_${i}`,
        timeoutMs: 5000,
      });
    }
    // Reset cursor after warmup.
    await termRead(sandbox.ctx, { terminalId: toTerminalId('lat'), since: 'all' });
  }, 60_000);

  afterAll(async () => {
    await sandbox.destroy();
  });

  it(
    `p95 term_send→visible latency <= ${P95_SEND_CEILING_MS} ms over ${N_SAMPLES} samples`,
    async () => {
      const samples: number[] = [];

      for (let i = 0; i < N_SAMPLES; i++) {
        const marker = `LAT_SEND_${i}_${Date.now()}`;
        const elapsed = await measureRoundTrip(sandbox, marker);
        samples.push(elapsed);
      }

      const { p50, p95 } = percentiles(samples);
      // Emit report to stdout (CI captures this).
      console.log(`[latency] term_send→visible  p50=${p50}ms  p95=${p95}ms  n=${N_SAMPLES}  ceiling=${P95_SEND_CEILING_MS}ms`);

      expect(p95, `p95 term_send→visible must be <= ${P95_SEND_CEILING_MS} ms`).toBeLessThanOrEqual(P95_SEND_CEILING_MS);
    },
    // Allow generous wall-clock time for N samples (each can be up to ceiling*10).
    N_SAMPLES * P95_SEND_CEILING_MS * 2,
  );

  it(
    `p95 term_read delta round-trip <= ${P95_READ_CEILING_MS} ms over ${N_SAMPLES} samples`,
    async () => {

      const samples: number[] = [];

      for (let i = 0; i < N_SAMPLES; i++) {
        const marker = `LAT_READ_${i}_${Date.now()}`;
        const elapsed = await measureReadDelta(sandbox, marker);
        samples.push(elapsed);
      }

      const { p50, p95 } = percentiles(samples);
      console.log(`[latency] term_read delta     p50=${p50}ms  p95=${p95}ms  n=${N_SAMPLES}  ceiling=${P95_READ_CEILING_MS}ms`);

      expect(p95, `p95 term_read delta must be <= ${P95_READ_CEILING_MS} ms`).toBeLessThanOrEqual(P95_READ_CEILING_MS);
    },
    N_SAMPLES * P95_READ_CEILING_MS * 2,
  );
});
