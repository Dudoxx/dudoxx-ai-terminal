/**
 * mcp-tools.spec.ts — contract tests for the MCP tool I/O schemas.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { describe, expect, it } from 'vitest';

import {
  TERM_ERROR_RETRIABLE,
  TERM_TOOL_INPUT_SCHEMAS,
  TERM_TOOL_NAMES,
  TERM_TOOL_OUTPUT_SCHEMAS,
  TermErrorCodeSchema,
  TermErrorSchema,
  TermSendInputSchema,
} from './mcp-tools';
import { toTerminalId } from './terminal';

describe('term_send input', () => {
  it('rejects a payload missing "text"', () => {
    const result = TermSendInputSchema.safeParse({ enter: true });
    expect(result.success).toBe(false);
  });

  it('accepts a minimal payload with only "text" and defaults enter=false', () => {
    const result = TermSendInputSchema.safeParse({ text: 'npm test' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enter).toBe(false);
      expect(result.data.terminalId).toBeUndefined();
    }
  });

  it('accepts an optional terminalId', () => {
    const result = TermSendInputSchema.safeParse({
      terminalId: 'term-build',
      text: 'echo hi',
      enter: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-string text', () => {
    const result = TermSendInputSchema.safeParse({ text: 123 });
    expect(result.success).toBe(false);
  });
});

describe('TermError discriminated union', () => {
  it('parses every code in the §4 enum with its canonical retriability', () => {
    for (const code of TermErrorCodeSchema.options) {
      const retriable = TERM_ERROR_RETRIABLE[code];
      const parsed = TermErrorSchema.safeParse({
        code,
        message: `error: ${code}`,
        retriable,
      });
      expect(parsed.success, `code ${code} should parse`).toBe(true);
    }
  });

  it('only TMUX_ERROR is retriable', () => {
    expect(TERM_ERROR_RETRIABLE.TMUX_ERROR).toBe(true);
    const nonRetriable = TermErrorCodeSchema.options.filter(
      (c) => c !== 'TMUX_ERROR',
    );
    for (const code of nonRetriable) {
      expect(TERM_ERROR_RETRIABLE[code]).toBe(false);
    }
  });

  it('rejects a TMUX_ERROR claiming retriable:false (retriability is fixed per code)', () => {
    const parsed = TermErrorSchema.safeParse({
      code: 'TMUX_ERROR',
      message: 'boom',
      retriable: false,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an unknown code', () => {
    const parsed = TermErrorSchema.safeParse({
      code: 'NOPE',
      message: 'x',
      retriable: false,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('verb registry', () => {
  it('exposes an input and output schema for every verb name', () => {
    for (const name of TERM_TOOL_NAMES) {
      expect(TERM_TOOL_INPUT_SCHEMAS[name]).toBeDefined();
      expect(TERM_TOOL_OUTPUT_SCHEMAS[name]).toBeDefined();
    }
  });

  it('lists exactly the 10 v1 verbs', () => {
    expect(TERM_TOOL_NAMES).toHaveLength(10);
  });
});

describe('term_create output', () => {
  it('round-trips a created terminal', () => {
    const parsed = TERM_TOOL_OUTPUT_SCHEMAS.term_create.safeParse({
      terminalId: toTerminalId('term-build'),
      windowId: '@7',
      panePid: 4242,
      cwd: '/home/optron/project',
      created: true,
    });
    expect(parsed.success).toBe(true);
  });
});
