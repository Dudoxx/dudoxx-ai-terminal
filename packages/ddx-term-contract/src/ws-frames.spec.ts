/**
 * ws-frames.spec.ts — contract tests for the WS frame union + descriptors.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { describe, expect, it } from 'vitest';

import { TerminalDescriptorSchema, toTerminalId } from './terminal';
import {
  ClientFrameSchema,
  ServerFrameSchema,
  TERM_FRAME_TYPES,
  TermFrameSchema,
} from './ws-frames';

const TID = toTerminalId('term-build');

/** Minimal valid payload per frame type — every one MUST carry terminalId. */
const sampleFrames: Record<string, Record<string, unknown>> = {
  output: { type: 'output', terminalId: 'term-build', data: 'hello' },
  'layout-change': {
    type: 'layout-change',
    terminalId: 'term-build',
    cols: 120,
    rows: 30,
  },
  'window-add': {
    type: 'window-add',
    terminalId: 'term-build',
    windowId: '@7',
  },
  'window-close': {
    type: 'window-close',
    terminalId: 'term-build',
    windowId: '@7',
  },
  error: { type: 'error', terminalId: 'term-build', message: 'boom' },
  'process-snapshot': {
    type: 'process-snapshot',
    terminalId: 'term-build',
    panePid: 100,
    fgPid: null,
    processes: [],
  },
  input: { type: 'input', terminalId: 'term-build', data: 'ls', enter: true },
};

describe('TermFrame union', () => {
  it('has a sample for every declared frame type', () => {
    for (const t of TERM_FRAME_TYPES) {
      expect(sampleFrames[t], `missing sample for ${t}`).toBeDefined();
    }
  });

  it('every frame variant parses and carries terminalId', () => {
    for (const t of TERM_FRAME_TYPES) {
      const payload = sampleFrames[t];
      const parsed = TermFrameSchema.safeParse(payload);
      expect(parsed.success, `frame ${t} should parse`).toBe(true);
      if (parsed.success) {
        expect(parsed.data.terminalId).toBe('term-build');
      }
    }
  });

  it('rejects ANY frame variant that omits terminalId', () => {
    for (const t of TERM_FRAME_TYPES) {
      const { terminalId: _omit, ...withoutTid } = sampleFrames[t]!;
      const parsed = TermFrameSchema.safeParse(withoutTid);
      expect(parsed.success, `frame ${t} without terminalId must reject`).toBe(
        false,
      );
    }
  });

  it('rejects an unknown frame type', () => {
    const parsed = TermFrameSchema.safeParse({
      type: 'bogus',
      terminalId: 'term-build',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('server vs client frame split', () => {
  it('server union accepts output but rejects input', () => {
    expect(ServerFrameSchema.safeParse(sampleFrames.output).success).toBe(true);
    expect(ServerFrameSchema.safeParse(sampleFrames.input).success).toBe(false);
  });

  it('client union accepts input but rejects output', () => {
    expect(ClientFrameSchema.safeParse(sampleFrames.input).success).toBe(true);
    expect(ClientFrameSchema.safeParse(sampleFrames.output).success).toBe(
      false,
    );
  });
});

describe('TerminalDescriptor', () => {
  it('round-trips a full descriptor (identity + snapshot fields)', () => {
    const descriptor = {
      terminalId: TID,
      windowId: '@7',
      title: 'build',
      panePid: 4242,
      fgPid: 4250,
      cwd: '/home/optron/project',
      command: 'npm',
      createdAt: 1_700_000_000_000,
    };
    const parsed = TerminalDescriptorSchema.safeParse(descriptor);
    expect(parsed.success).toBe(true);
  });

  it('accepts fgPid: null (no foreground child at the prompt)', () => {
    const parsed = TerminalDescriptorSchema.safeParse({
      terminalId: TID,
      windowId: '@7',
      title: 'idle',
      panePid: 4242,
      fgPid: null,
      cwd: '/tmp',
      command: 'zsh',
      createdAt: 1_700_000_000_000,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a missing windowId (identity field is required)', () => {
    const parsed = TerminalDescriptorSchema.safeParse({
      terminalId: TID,
      title: 'x',
      panePid: 1,
      fgPid: null,
      cwd: '/tmp',
      command: 'zsh',
      createdAt: 1,
    });
    expect(parsed.success).toBe(false);
  });
});
