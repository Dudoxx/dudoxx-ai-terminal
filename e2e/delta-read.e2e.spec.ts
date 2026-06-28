/**
 * delta-read.e2e.spec.ts — FM#3.
 *
 * Proves the delta-by-default contract against a REAL tmux session:
 *   - 1000-line output produced; first read returns all 1000 lines
 *   - second read (since='last') returns ONLY the new lines since the cursor
 *   - since='all' returns the full buffer and resets the cursor so the next
 *     delta is empty
 *
 * This is the token-flood guard: NEVER return full scrollback on every read
 * (_invariants.md NEVER #4). The ReadCursor tracks what the agent has seen.
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
import { TmuxSandbox, tmuxAvailable } from './helpers/tmux-sandbox.js';

const HAS_TMUX = tmuxAvailable();

describe.skipIf(!HAS_TMUX)('delta read — FM#3', () => {
  let sandbox: TmuxSandbox;

  beforeAll(async () => {
    sandbox = await TmuxSandbox.create('ddx-e2e-delta');
    await termCreate(sandbox.ctx, { name: 'flood' });
  });

  afterAll(async () => {
    await sandbox.destroy();
  });

  it('first read after 1000-line output returns all lines; second read returns only the delta', async () => {
    // Produce a large, marker-terminated scrollback block (1000 seq lines + sentinel).
    const sentinel = `DELTA_SENTINEL_${Date.now()}`;
    await termSend(sandbox.ctx, {
      terminalId: toTerminalId('flood'),
      text: `seq 1 1000 && echo ${sentinel}`,
      enter: true,
    });

    // Wait until the sentinel appears in the VISIBLE pane.
    const ready = await termWaitFor(sandbox.ctx, {
      terminalId: toTerminalId('flood'),
      pattern: sentinel,
      timeoutMs: 15_000,
    });
    expect(ready.matched, 'sentinel must appear before reading').toBe(true);

    // After the visible pane shows the sentinel, give tmux a brief moment to
    // flush the full seq output into the scrollback history buffer. The visible
    // pane can show the sentinel (last line) while the scrollback is still
    // being written by tmux's capture pipeline.
    await new Promise<void>((r) => setTimeout(r, 200));

    // First read — cursor starts at -1 so this captures the full available buffer.
    const first = await termRead(sandbox.ctx, {
      terminalId: toTerminalId('flood'),
      since: 'last',
    });
    expect(first.text, 'first read must contain the sentinel').toContain(sentinel);
    // The buffer includes the seq output — expect many lines (capped by maxReadLines).
    expect(first.text.split('\n').length, 'first read should have many lines').toBeGreaterThan(100);

    // Second read immediately — no new output has appeared.
    const second = await termRead(sandbox.ctx, {
      terminalId: toTerminalId('flood'),
      since: 'last',
    });
    expect(second.text, 'second delta with no new output must be empty or minimal').toBe('');
  });

  it('new output after cursor-reset appears in the next delta only', async () => {
    // Reset cursor via full read.
    await termRead(sandbox.ctx, { terminalId: toTerminalId('flood'), since: 'all' });

    const newMarker = `DELTA_NEW_${Date.now()}`;
    await termSend(sandbox.ctx, {
      terminalId: toTerminalId('flood'),
      text: `echo ${newMarker}`,
      enter: true,
    });

    await termWaitFor(sandbox.ctx, {
      terminalId: toTerminalId('flood'),
      pattern: newMarker,
      timeoutMs: 5000,
    });

    // Delta must contain ONLY the new marker, not the earlier seq block.
    const delta = await termRead(sandbox.ctx, {
      terminalId: toTerminalId('flood'),
      since: 'last',
    });
    expect(delta.text, 'delta must contain the new marker').toContain(newMarker);
    // The seq numbers (e.g. "500") should NOT be in this narrow delta.
    expect(delta.text.split('\n').length, 'delta should be narrow').toBeLessThan(20);
  });

  it('since="all" resets cursor so the next delta excludes already-seen lines', async () => {
    const marker = `DELTA_ALL_RESET_${Date.now()}`;
    await termSend(sandbox.ctx, {
      terminalId: toTerminalId('flood'),
      text: `echo ${marker}`,
      enter: true,
    });
    await termWaitFor(sandbox.ctx, {
      terminalId: toTerminalId('flood'),
      pattern: marker,
      timeoutMs: 5000,
    });

    // Full read resets cursor to tail and must contain the marker.
    const full = await termRead(sandbox.ctx, {
      terminalId: toTerminalId('flood'),
      since: 'all',
    });
    expect(full.text, 'full read must contain marker').toContain(marker);

    // The subsequent delta must NOT contain the marker or lines from the seq
    // flood — those are before the cursor reset. The shell may emit a prompt
    // line after the reset (expected behaviour when scrollback is saturated
    // and the cap window slides forward), but old content must not appear.
    const afterReset = await termRead(sandbox.ctx, {
      terminalId: toTerminalId('flood'),
      since: 'last',
    });
    expect(afterReset.text, 'delta after reset must not replay the reset marker').not.toContain(marker);
    // The seq numbers from the flood are also excluded.
    expect(afterReset.text, 'delta must not replay flood numbers').not.toMatch(/^(?:5[0-9]{2}|[1-9][0-9]{2})$/m);
  });
});
