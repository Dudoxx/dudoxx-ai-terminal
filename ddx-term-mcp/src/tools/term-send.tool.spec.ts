/**
 * term-send.tool.spec.ts — the LOCKED send mechanics (invariant 4 / SPIKE).
 *
 * Asserts term_send issues `send-keys -l <text>` and, when enter, a SEPARATE
 * `Enter` key — TWO tmux calls, never a '\n' literal. Also that the allow-list
 * gate runs before any tmux call (COMMAND_DENIED).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { toTerminalId } from '@ddx/term-contract';

import { AllowList } from '../allow-list.js';
import { TermError } from '../errors.js';
import { termSend } from './term-send.tool.js';
import { asContext, makeContext } from './_test-helpers.js';

describe('term_send', () => {
  it('sends literal text then a SEPARATE Enter key (two calls, no \\n)', async () => {
    const ctx = makeContext();
    const res = await termSend(asContext(ctx), { terminalId: toTerminalId('t01'), text: 'npm test', enter: true });

    expect(ctx.tmux.sendKeysLiteral).toHaveBeenCalledTimes(1);
    expect(ctx.tmux.sendKeysLiteral).toHaveBeenCalledWith('@1', 'npm test');
    expect(ctx.tmux.sendKey).toHaveBeenCalledTimes(1);
    expect(ctx.tmux.sendKey).toHaveBeenCalledWith('@1', 'Enter');
    // The literal text must never contain a newline.
    const literalArg = ctx.tmux.sendKeysLiteral.mock.calls[0]?.[1] as string;
    expect(literalArg).not.toContain('\n');
    expect(res).toEqual({ ok: true, terminalId: toTerminalId('t01') });
  });

  it('omits the Enter key when enter=false', async () => {
    const ctx = makeContext();
    await termSend(asContext(ctx), { text: 'partial', enter: false });
    expect(ctx.tmux.sendKeysLiteral).toHaveBeenCalledWith('@1', 'partial');
    expect(ctx.tmux.sendKey).not.toHaveBeenCalled();
  });

  it('defaults the terminalId to the server default', async () => {
    const ctx = makeContext();
    await termSend(asContext(ctx), { text: 'x', enter: false });
    expect(ctx.resolver.resolve).toHaveBeenCalledWith(toTerminalId('t01'));
  });

  it('rejects a denied command via the allow-list BEFORE any tmux call', async () => {
    const path = join(tmpdir(), `ddx-allow-${Date.now()}.json`);
    writeFileSync(path, JSON.stringify({ mode: 'deny', patterns: ['^rm -rf /'] }));
    const ctx = makeContext({ allowList: AllowList.fromPath(path) });
    await expect(termSend(asContext(ctx), { text: 'rm -rf /', enter: true })).rejects.toBeInstanceOf(TermError);
    expect(ctx.tmux.sendKeysLiteral).not.toHaveBeenCalled();
    expect(ctx.tmux.sendKey).not.toHaveBeenCalled();
  });
});
