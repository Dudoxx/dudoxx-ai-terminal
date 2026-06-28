/**
 * term-send.tool.ts — inject literal keystrokes into a terminal's PTY.
 *
 * LOCKED mechanics (invariant 4 / SPIKE Spike 2): the command text is sent as a
 * SINGLE `send-keys -l <text>` (literal), and the newline — when `enter` — is a
 * SEPARATE `send-keys Enter` key event. NEVER a `\n` inside the literal. Control
 * keys / TUI arrows do NOT come here — they go through term_signal as KEY NAMES.
 *
 * The text is gated by the allow-list (COMMAND_DENIED) before any tmux call.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import type { TermSendInput, TermSendOutput } from '@ddx/term-contract';

import { resolveTerminalId, type ToolContext } from '../context.js';

export async function termSend(ctx: ToolContext, input: TermSendInput): Promise<TermSendOutput> {
  const terminalId = resolveTerminalId(ctx, input.terminalId);
  // Gate the command text BEFORE touching tmux (Feature 8.2).
  ctx.allowList.check(input.text);
  const resolved = await ctx.resolver.resolve(terminalId);
  // 1) literal text, typed verbatim — no key-name parsing.
  await ctx.tmux.sendKeysLiteral(resolved.windowId, input.text);
  // 2) the Enter is a SEPARATE key event, never a '\n' in the literal.
  if (input.enter) {
    await ctx.tmux.sendKey(resolved.windowId, 'Enter');
  }
  return { ok: true, terminalId };
}
