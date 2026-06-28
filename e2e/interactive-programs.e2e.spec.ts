/**
 * interactive-programs.e2e.spec.ts — AC #6/#7.
 *
 * Proves the agent can drive REAL interactive programs via send-keys:
 *   - ddx-cli-py (uv + Rich): line prompts answered with literal text + Enter
 *   - ddx-cli-ts (pnpm + clack): raw-mode TUI select driven with Down KEY NAME + Enter
 *
 * CRITICAL mechanics (SPIKE Spike 2 / _invariants.md):
 *   - term_wait_for BEFORE each answer — keystrokes race the program otherwise
 *   - Arrow-key TUI nav via KEY NAMES (Down), never literal escape bytes
 *   - Line prompts via sendKeysLiteral + Enter (two separate calls)
 *
 * The fixtures ddx-cli-py / ddx-cli-ts are READ/RUN only — never edit them.
 * They print a DONE marker on completion; the test waits for that marker.
 *
 * Uses a real throwaway tmux on a TEMP socket (never the user's server).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { toTerminalId } from '@ddx/term-contract';

import { termCreate } from '../ddx-term-mcp/src/tools/term-create.tool.js';
import { termRead } from '../ddx-term-mcp/src/tools/term-read.tool.js';
import { termSend } from '../ddx-term-mcp/src/tools/term-send.tool.js';
import { termSignal } from '../ddx-term-mcp/src/tools/term-signal.tool.js';
import { termWaitFor } from '../ddx-term-mcp/src/tools/term-wait-for.tool.js';
import { TmuxSandbox, tmuxAvailable } from './helpers/tmux-sandbox.js';

const HAS_TMUX = tmuxAvailable();

/** Check that `uv` is available (needed for ddx-cli-py). */
function uvAvailable(): boolean {
  try {
    execFileSync('uv', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Check that `pnpm` is available (needed for ddx-cli-ts). */
function pnpmAvailable(): boolean {
  try {
    execFileSync('pnpm', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const HAS_UV = uvAvailable();
const HAS_PNPM = pnpmAvailable();

// Absolute paths to the repo-root fixtures (read/run only — never edit).
const REPO_ROOT = resolve(import.meta.dirname, '..');
const PY_FIXTURE = resolve(REPO_ROOT, 'ddx-cli-py');
const TS_FIXTURE = resolve(REPO_ROOT, 'ddx-cli-ts');

/** Generous timeout for interactive program startup + Rich/clack rendering. */
const PROGRAM_TIMEOUT_MS = 20_000;

describe.skipIf(!HAS_TMUX)('interactive programs — AC #6/#7', () => {
  let sandbox: TmuxSandbox;

  beforeAll(async () => {
    sandbox = await TmuxSandbox.create('ddx-e2e-interactive');
  });

  afterAll(async () => {
    await sandbox.destroy();
  });

  describe.skipIf(!HAS_UV)('ddx-cli-py (Rich line prompts) — AC #6', () => {
    beforeAll(async () => {
      await termCreate(sandbox.ctx, { name: 'py' });
    });

    it('agent answers Rich prompts and the program prints the DONE marker', async () => {
      // Launch the fixture via uv (uses .venv, no manual activate).
      await termSend(sandbox.ctx, {
        terminalId: toTerminalId('py'),
        text: `cd ${PY_FIXTURE} && uv run main.py`,
        enter: true,
      });

      // Wait for the "What is your name" prompt before answering.
      const namePrompt = await termWaitFor(sandbox.ctx, {
        terminalId: toTerminalId('py'),
        pattern: 'What is your name',
        timeoutMs: PROGRAM_TIMEOUT_MS,
      });
      expect(namePrompt.matched, 'Rich name prompt must appear').toBe(true);

      // Answer with literal text + Enter (two separate calls — _invariants.md MUST #6).
      await termSend(sandbox.ctx, {
        terminalId: toTerminalId('py'),
        text: 'Atlas',
        enter: true,
      });

      // Wait for the color prompt before answering.
      const colorPrompt = await termWaitFor(sandbox.ctx, {
        terminalId: toTerminalId('py'),
        pattern: 'Pick a color',
        timeoutMs: PROGRAM_TIMEOUT_MS,
      });
      expect(colorPrompt.matched, 'Rich color prompt must appear').toBe(true);

      await termSend(sandbox.ctx, {
        terminalId: toTerminalId('py'),
        text: 'blue',
        enter: true,
      });

      // The fixture prints DDX-CLI-PY-DONE on completion.
      const done = await termWaitFor(sandbox.ctx, {
        terminalId: toTerminalId('py'),
        pattern: 'DDX-CLI-PY-DONE',
        timeoutMs: PROGRAM_TIMEOUT_MS,
      });
      expect(done.matched, 'DDX-CLI-PY-DONE marker must appear').toBe(true);

      const output = await termRead(sandbox.ctx, { terminalId: toTerminalId('py'), since: 'all' });
      expect(output.text).toContain('DDX-CLI-PY-DONE name=Atlas color=blue');
    });
  });

  describe.skipIf(!HAS_PNPM)('ddx-cli-ts (clack raw-mode TUI select) — AC #7', () => {
    beforeAll(async () => {
      await termCreate(sandbox.ctx, { name: 'ts' });
    });

    it('agent drives clack select with Down KEY NAME and the program prints the DONE marker', async () => {
      // Launch via pnpm start (tsx, uses local node_modules).
      await termSend(sandbox.ctx, {
        terminalId: toTerminalId('ts'),
        text: `cd ${TS_FIXTURE} && pnpm start`,
        enter: true,
      });

      // Wait for the name text prompt.
      const namePrompt = await termWaitFor(sandbox.ctx, {
        terminalId: toTerminalId('ts'),
        pattern: 'What is your name',
        timeoutMs: PROGRAM_TIMEOUT_MS,
      });
      expect(namePrompt.matched, 'clack name prompt must appear').toBe(true);

      // Answer the name prompt with literal text + Enter.
      await termSend(sandbox.ctx, {
        terminalId: toTerminalId('ts'),
        text: 'Echo',
        enter: true,
      });

      // Wait for the color select to render (clack shows "Pick a color").
      const colorPrompt = await termWaitFor(sandbox.ctx, {
        terminalId: toTerminalId('ts'),
        pattern: 'Pick a color',
        timeoutMs: PROGRAM_TIMEOUT_MS,
      });
      expect(colorPrompt.matched, 'clack color select must appear').toBe(true);

      // Navigate the raw-mode TUI select with KEY NAMES (not literal escapes).
      // Initial selection is 'green' (index 1); one Down moves to 'blue' (index 2).
      // _invariants.md MUST #6: arrow-key nav via termSignal KEY NAMES.
      await termSignal(sandbox.ctx, { terminalId: toTerminalId('ts'), signal: 'Down' });

      // Wait for the selection to settle before confirming.
      await termWaitFor(sandbox.ctx, {
        terminalId: toTerminalId('ts'),
        pattern: 'blue',
        timeoutMs: 4000,
      });

      // Confirm the selection with Enter.
      await termSignal(sandbox.ctx, { terminalId: toTerminalId('ts'), signal: 'Enter' });

      // The fixture prints DDX-CLI-TS-DONE on completion.
      const done = await termWaitFor(sandbox.ctx, {
        terminalId: toTerminalId('ts'),
        pattern: 'DDX-CLI-TS-DONE',
        timeoutMs: PROGRAM_TIMEOUT_MS,
      });
      expect(done.matched, 'DDX-CLI-TS-DONE marker must appear').toBe(true);

      const output = await termRead(sandbox.ctx, { terminalId: toTerminalId('ts'), since: 'all' });
      expect(output.text).toContain('DDX-CLI-TS-DONE name=Echo color=blue');
    });
  });
});
