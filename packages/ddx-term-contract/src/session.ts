/**
 * session.ts — the shared-session descriptor + the two policy enums.
 *
 * One persistent tmux session ('ddx-shared') hosts MANY terminals (windows).
 * The session owns the canonical pinned dimensions (ARCHITECTURE §6 — the
 * resize-war mitigation) and the input-arbitration policy (ARCHITECTURE §7).
 *
 * Pure types + zod only.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { z } from 'zod/v4';

/**
 * How the session reconciles client viewport sizes against its pinned grid.
 *
 * - PINNED_DEFAULT_SIZE: broker pins via `set-option -g default-size WxH`;
 *   detached windows get a concrete size without the `window-size manual`
 *   server-crash footgun (ARCHITECTURE §6, _invariants NEVER #1). Default.
 * - AGGRESSIVE_RESIZE_OFF: complementary per-client setting once clients
 *   attach — keeps a small client from shrinking the shared grid.
 * - SMALLEST_CLIENT: vanilla tmux behaviour (smallest attached client wins).
 *   Declared for completeness; NOT used in v1 (it is the resize-war bug).
 */
export const ResizePolicySchema = z.enum([
  'PINNED_DEFAULT_SIZE',
  'AGGRESSIVE_RESIZE_OFF',
  'SMALLEST_CLIENT',
]);
export type ResizePolicy = z.infer<typeof ResizePolicySchema>;

/** Canonical default resize policy (the pinned-grid mitigation). */
export const DEFAULT_RESIZE_POLICY: ResizePolicy = 'PINNED_DEFAULT_SIZE';

/**
 * Who may type into which terminal (ARCHITECTURE §7, AC #9).
 *
 * - AGENT_OWN_WINDOW: agent operates in its own window(s) (1+), the human owns
 *   window 0. They share the session/scrollback/state but never fight over a
 *   single prompt. DEFAULT.
 * - FREE_FOR_ALL: every attached party may type into every terminal.
 * - HUMAN_LOCK: only the human may type; the agent is read/observe-only.
 */
export const InputArbitrationSchema = z.enum([
  'AGENT_OWN_WINDOW',
  'FREE_FOR_ALL',
  'HUMAN_LOCK',
]);
export type InputArbitration = z.infer<typeof InputArbitrationSchema>;

/** Canonical default input-arbitration policy. */
export const DEFAULT_INPUT_ARBITRATION: InputArbitration = 'AGENT_OWN_WINDOW';

/**
 * The shared tmux session descriptor. The broker's SessionService owns one of
 * these; it carries the canonical dimensions every renderer must clamp to and
 * the active policies. Per-terminal records live in TerminalDescriptor.
 */
export const SessionDescriptorSchema = z.object({
  /** tmux session name (env DDX_TERM_SESSION, default 'ddx-shared'). */
  sessionId: z.string().min(1),
  /** tmux -S socket path (env DDX_TERM_SOCKET, default '/tmp/ddx-term.sock'). */
  socketPath: z.string().min(1),
  /** Canonical pinned width in columns (default 120). */
  cols: z.number().int().positive(),
  /** Canonical pinned height in rows (default 30). */
  rows: z.number().int().positive(),
  /** Active resize policy. */
  resizePolicy: ResizePolicySchema,
  /** Active input-arbitration policy. */
  inputArbitration: InputArbitrationSchema,
  /** terminalId of the agent's default terminal (env DDX_TERM_DEFAULT, 't01'). */
  defaultTerminalId: z.string().min(1),
  /** Epoch ms when the session was created. */
  createdAt: z.number().int().nonnegative(),
});
export type SessionDescriptor = z.infer<typeof SessionDescriptorSchema>;
