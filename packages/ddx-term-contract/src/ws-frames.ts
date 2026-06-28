/**
 * ws-frames.ts — the control-mode → WebSocket frame contract.
 *
 * The broker parses tmux control-mode (`-CC`) output (%output, %layout-change,
 * %window-add, %window-close, …) into typed frames and fans them out over
 * `WS /term/:terminalId`. The browser sends `input` frames back. This is the
 * discriminated union on `type` that both ends share.
 *
 * HARD INVARIANT (plans/ddx-terminal-bridge/_invariants.md, pitfall #2):
 * EVERY frame variant — server→client AND client→server — carries terminalId.
 * Per-terminal WS routing breaks the instant a variant omits it. The union is
 * OPEN for v2 frame types (add a variant without breaking existing consumers).
 *
 * Pure types + zod only.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { z } from 'zod/v4';

import { ProcessInfoSchema, TerminalIdSchema } from './terminal';

/**
 * Shared base every frame carries. The terminalId tag is what makes the
 * stream per-terminal routable — it is NON-NEGOTIABLE on every variant.
 */
const FrameBase = z.object({
  /** The terminal this frame belongs to. Present on EVERY variant. */
  terminalId: TerminalIdSchema,
});

// ── server → client ────────────────────────────────────────────────────────

/**
 * A chunk of rendered terminal output (tmux %output). `data` may include ANSI
 * escapes when the capture was taken with `-e`; `withAnsi` records which.
 */
export const OutputFrameSchema = FrameBase.extend({
  type: z.literal('output'),
  /** Raw output bytes as a string (optionally ANSI-styled). */
  data: z.string(),
  /** Whether `data` contains ANSI colour/style escapes. */
  withAnsi: z.boolean().optional(),
});
export type OutputFrame = z.infer<typeof OutputFrameSchema>;

/**
 * Pane/window geometry changed (tmux %layout-change). Carries the current grid
 * dimensions so the renderer can clamp/fit (xterm fit addon).
 */
export const LayoutChangeFrameSchema = FrameBase.extend({
  type: z.literal('layout-change'),
  /** Current pane width in columns. */
  cols: z.number().int().positive(),
  /** Current pane height in rows. */
  rows: z.number().int().positive(),
  /** Opaque tmux layout string, when available. */
  layout: z.string().optional(),
});
export type LayoutChangeFrame = z.infer<typeof LayoutChangeFrameSchema>;

/**
 * A new terminal (tmux window) appeared in the shared session
 * (tmux %window-add). Lets every renderer learn about terminals the agent (or
 * another human) created.
 */
export const WindowAddFrameSchema = FrameBase.extend({
  type: z.literal('window-add'),
  /** Internal tmux window handle ('@7'). */
  windowId: z.string().min(1),
  /** Human-facing title for the new terminal. */
  title: z.string().optional(),
});
export type WindowAddFrame = z.infer<typeof WindowAddFrameSchema>;

/**
 * A terminal (tmux window) was closed (tmux %window-close). Renderers should
 * tear down the corresponding sub-stream/view.
 */
export const WindowCloseFrameSchema = FrameBase.extend({
  type: z.literal('window-close'),
  /** Internal tmux window handle ('@7') that closed. */
  windowId: z.string().min(1),
});
export type WindowCloseFrame = z.infer<typeof WindowCloseFrameSchema>;

/**
 * An error scoped to a terminal (parse failure, dropped attach, tmux error).
 * Keyed by terminalId so a fault in one terminal does not poison the others.
 */
export const ErrorFrameSchema = FrameBase.extend({
  type: z.literal('error'),
  /** Human-readable error message. */
  message: z.string(),
  /** Optional machine code for programmatic handling. */
  code: z.string().optional(),
});
export type ErrorFrame = z.infer<typeof ErrorFrameSchema>;

/**
 * A process-tree snapshot pushed to renderers (optional helper frame; lets a
 * UI show what is running without an out-of-band fetch). SNAPSHOT data.
 */
export const ProcessSnapshotFrameSchema = FrameBase.extend({
  type: z.literal('process-snapshot'),
  /** #{pane_pid} — the shell PID. */
  panePid: z.number().int().nonnegative(),
  /** Foreground child PID, or null at the prompt. */
  fgPid: z.number().int().nonnegative().nullable(),
  /** Live process tree rows. */
  processes: z.array(ProcessInfoSchema),
});
export type ProcessSnapshotFrame = z.infer<typeof ProcessSnapshotFrameSchema>;

/** All server→client frames. */
export const ServerFrameSchema = z.discriminatedUnion('type', [
  OutputFrameSchema,
  LayoutChangeFrameSchema,
  WindowAddFrameSchema,
  WindowCloseFrameSchema,
  ErrorFrameSchema,
  ProcessSnapshotFrameSchema,
]);
export type ServerFrame = z.infer<typeof ServerFrameSchema>;

// ── client → server ──────────────────────────────────────────────────────

/**
 * A keystroke / text input from the browser destined for a terminal's PTY
 * (tmux send-keys -l). `enter` requests a separate Enter key event after the
 * literal text (the SPIKE.md send-keys discipline). Control keys do NOT come
 * through here — they go via the MCP term_signal verb (key-names).
 */
export const InputFrameSchema = FrameBase.extend({
  type: z.literal('input'),
  /** Literal text to inject (sent with send-keys -l). */
  data: z.string(),
  /** Send a separate Enter key event after the text. */
  enter: z.boolean().optional(),
});
export type InputFrame = z.infer<typeof InputFrameSchema>;

/** All client→server frames. */
export const ClientFrameSchema = z.discriminatedUnion('type', [
  InputFrameSchema,
]);
export type ClientFrame = z.infer<typeof ClientFrameSchema>;

// ── union of both directions ─────────────────────────────────────────────

/**
 * Every frame on the wire, both directions. Every member carries terminalId
 * (enforced by FrameBase). Discriminated on `type` for exhaustive switching.
 */
export const TermFrameSchema = z.discriminatedUnion('type', [
  OutputFrameSchema,
  LayoutChangeFrameSchema,
  WindowAddFrameSchema,
  WindowCloseFrameSchema,
  ErrorFrameSchema,
  ProcessSnapshotFrameSchema,
  InputFrameSchema,
]);
export type TermFrame = z.infer<typeof TermFrameSchema>;

/** All frame discriminant values (handy for tests / exhaustiveness checks). */
export const TERM_FRAME_TYPES = [
  'output',
  'layout-change',
  'window-add',
  'window-close',
  'error',
  'process-snapshot',
  'input',
] as const;
export type TermFrameType = (typeof TERM_FRAME_TYPES)[number];
