/**
 * control-mode.parser.spec.ts — golden-fixture tests for the control-mode parser.
 *
 * Each test feeds a real tmux -CC output line and asserts the typed frame shape.
 * No process spawning, no network — pure function tests.
 *
 * Identity discipline (the bug these tests now guard):
 *   - %output lines are PANE-keyed ('%N') → resolved via resolvePane.
 *   - %layout-change / %window-add / %window-close are WINDOW-keyed ('@N') →
 *     resolved via resolveWindow.
 * Conflating the two (resolving a pane '%3' against the window registry) dropped
 * EVERY output frame in production.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { parseControlModeLine } from './control-mode.parser';
import type { FrameResolvers } from './control-mode.parser';
import { toTerminalId, type TerminalId, type WindowId } from '@ddx/term-contract';

// Window resolver: '@1' → 'term-build', '@2' → 'term-repl'.
// Pane resolver:   '%1' → 'term-build', '%2' → 'term-repl' (pane '%N' lives in window '@N').
const TERM_BUILD = toTerminalId('term-build');
const TERM_REPL = toTerminalId('term-repl');

const resolvers: FrameResolvers = {
  resolveWindow: (windowId: WindowId): TerminalId | undefined => {
    if (windowId === '@1') return TERM_BUILD;
    if (windowId === '@2') return TERM_REPL;
    return undefined;
  },
  resolvePane: (paneId: string): TerminalId | undefined => {
    if (paneId === '%1') return TERM_BUILD;
    if (paneId === '%2') return TERM_REPL;
    return undefined;
  },
};

describe('parseControlModeLine › %output', () => {
  it('parses a %output line into an OutputFrame with correct terminalId and data', () => {
    // Real tmux -CC output line: %output %<pane-id> <data>
    const line = '%output %1 hello world';
    const result = parseControlModeLine(line, resolvers);

    expect(result.kind).toBe('frame');
    if (result.kind !== 'frame') return;
    expect(result.frame.type).toBe('output');
    if (result.frame.type !== 'output') return;
    expect(result.frame.terminalId).toBe('term-build');
    expect(result.frame.data).toBe('hello world');
    expect(result.frame.withAnsi).toBe(true);
  });

  it('drops an %output line whose paneId is not registered', () => {
    const line = '%output %99 some data';
    const result = parseControlModeLine(line, resolvers);
    expect(result.kind).toBe('unknown');
  });

  it('drops an %output line that carries a window-id instead of a pane-id', () => {
    // Regression guard: '@1' is a WINDOW id; the pane resolver must NOT match it,
    // otherwise we are back to the pane/window conflation bug.
    const line = '%output @1 should-not-route';
    const result = parseControlModeLine(line, resolvers);
    expect(result.kind).toBe('unknown');
  });

  it('routes %output for %2 to term-repl (per-terminal isolation)', () => {
    const line = '%output %2 npm test output';
    const result = parseControlModeLine(line, resolvers);

    expect(result.kind).toBe('frame');
    if (result.kind !== 'frame') return;
    expect(result.frame.type).toBe('output');
    if (result.frame.type !== 'output') return;
    expect(result.frame.terminalId).toBe('term-repl');
    expect(result.frame.data).toBe('npm test output');
  });

  it('preserves data containing spaces verbatim', () => {
    const line = '%output %1 line one\tline two  end';
    const result = parseControlModeLine(line, resolvers);

    expect(result.kind).toBe('frame');
    if (result.kind !== 'frame') return;
    if (result.frame.type !== 'output') return;
    expect(result.frame.data).toBe('line one\tline two  end');
  });
});

describe('parseControlModeLine › %layout-change', () => {
  it('parses cols and rows from the layout string', () => {
    const line = '%layout-change @1 120x30,0,0,1';
    const result = parseControlModeLine(line, resolvers);

    expect(result.kind).toBe('frame');
    if (result.kind !== 'frame') return;
    expect(result.frame.type).toBe('layout-change');
    if (result.frame.type !== 'layout-change') return;
    expect(result.frame.terminalId).toBe('term-build');
    expect(result.frame.cols).toBe(120);
    expect(result.frame.rows).toBe(30);
    expect(result.frame.layout).toBe('120x30,0,0,1');
  });

  it('falls back to 120x30 when layout string lacks dimensions', () => {
    const line = '%layout-change @1 invalid-layout';
    const result = parseControlModeLine(line, resolvers);

    expect(result.kind).toBe('frame');
    if (result.kind !== 'frame') return;
    if (result.frame.type !== 'layout-change') return;
    expect(result.frame.cols).toBe(120);
    expect(result.frame.rows).toBe(30);
  });

  it('drops %layout-change for an unregistered window', () => {
    const line = '%layout-change @99 80x24,0,0,1';
    const result = parseControlModeLine(line, resolvers);
    expect(result.kind).toBe('unknown');
  });
});

describe('parseControlModeLine › %window-add', () => {
  it('emits a window-add frame with the resolved terminalId', () => {
    const line = '%window-add @1';
    const result = parseControlModeLine(line, resolvers);

    expect(result.kind).toBe('frame');
    if (result.kind !== 'frame') return;
    expect(result.frame.type).toBe('window-add');
    if (result.frame.type !== 'window-add') return;
    expect(result.frame.terminalId).toBe('term-build');
    expect(result.frame.windowId).toBe('@1');
  });

  it('falls back to windowId as terminalId when resolver returns undefined (create race)', () => {
    const line = '%window-add @99';
    const result = parseControlModeLine(line, resolvers);

    expect(result.kind).toBe('frame');
    if (result.kind !== 'frame') return;
    if (result.frame.type !== 'window-add') return;
    // windowId used as terminalId fallback during the create race.
    expect(result.frame.windowId).toBe('@99');
  });
});

describe('parseControlModeLine › %window-close', () => {
  it('emits a window-close frame', () => {
    const line = '%window-close @2';
    const result = parseControlModeLine(line, resolvers);

    expect(result.kind).toBe('frame');
    if (result.kind !== 'frame') return;
    expect(result.frame.type).toBe('window-close');
    if (result.frame.type !== 'window-close') return;
    expect(result.frame.terminalId).toBe('term-repl');
    expect(result.frame.windowId).toBe('@2');
  });
});

describe('parseControlModeLine › unknown / control lines', () => {
  it('returns unknown for %begin lines (control flow)', () => {
    const result = parseControlModeLine('%begin 1700000000 4 0', resolvers);
    expect(result.kind).toBe('unknown');
  });

  it('returns unknown for %end lines', () => {
    const result = parseControlModeLine('%end 1700000000 4 0', resolvers);
    expect(result.kind).toBe('unknown');
  });

  it('returns unknown for %session-changed', () => {
    const result = parseControlModeLine('%session-changed $1 ddx-shared', resolvers);
    expect(result.kind).toBe('unknown');
  });

  it('returns unknown for empty lines', () => {
    const result = parseControlModeLine('', resolvers);
    expect(result.kind).toBe('unknown');
  });
});

describe('parseControlModeLine › per-terminal isolation (RESPONSIVENESS §2.8)', () => {
  it('routes %1 and %2 to different terminalIds — never cross-pollutes', () => {
    const r1 = parseControlModeLine('%output %1 from-build', resolvers);
    const r2 = parseControlModeLine('%output %2 from-repl', resolvers);

    expect(r1.kind).toBe('frame');
    expect(r2.kind).toBe('frame');
    if (r1.kind !== 'frame' || r2.kind !== 'frame') return;
    if (r1.frame.type !== 'output' || r2.frame.type !== 'output') return;

    expect(r1.frame.terminalId).toBe('term-build');
    expect(r2.frame.terminalId).toBe('term-repl');
    expect(r1.frame.terminalId).not.toBe(r2.frame.terminalId);
  });
});
