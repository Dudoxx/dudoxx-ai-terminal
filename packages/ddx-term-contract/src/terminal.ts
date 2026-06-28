/**
 * terminal.ts — the multi-terminal core types.
 *
 * Two identifiers that MUST NEVER be conflated (plans/ddx-terminal-bridge
 * _invariants.md FM#4, ARCHITECTURE §1a):
 *
 *   - terminalId / windowId  → IDENTITY. Durable. terminalId is the stable
 *     handle (= one tmux window); windowId is tmux's internal '@N' binding.
 *     Every verb / WS frame ADDRESSES by terminalId.
 *
 *   - panePid / fgPid / pid  → SNAPSHOT. Transient OS PIDs re-read on demand.
 *     panePid is the shell; fgPid is the foreground child. A pid is what you
 *     SIGNAL / observe — never an identity.
 *
 * Pure types + zod only. No runtime tmux logic.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { z } from 'zod/v4';

/**
 * Branded terminal-handle string. The stable, durable identity for one
 * terminal (= one tmux window) in the shared session. Slug ('term-build') or
 * auto ('t01'). The brand prevents accidentally passing a raw windowId, pid,
 * or other string where a terminalId is required (compile-time guard for the
 * FM#4 identity/snapshot separation).
 */
export const TerminalIdSchema = z
  .string()
  .min(1)
  .brand<'TerminalId'>();
export type TerminalId = z.infer<typeof TerminalIdSchema>;

/** Construct a TerminalId from a validated raw string. */
export const toTerminalId = (raw: string): TerminalId =>
  TerminalIdSchema.parse(raw);

/**
 * tmux internal window handle, e.g. '@7'. INTERNAL binding only — never the
 * public address (that is terminalId). Kept distinct so the schema layer
 * cannot silently treat a windowId as a terminalId.
 */
export const WindowIdSchema = z
  .string()
  .min(1)
  .brand<'WindowId'>();
export type WindowId = z.infer<typeof WindowIdSchema>;

/**
 * A reference to a single OS process by PID. TRANSIENT — what term_signal /
 * term_ps operate on. Deliberately a thin wrapper (not just `number`) so a
 * pid-typed value is never mistaken for an identity at a call site.
 */
export const PidRefSchema = z.object({
  pid: z.number().int().nonnegative(),
});
export type PidRef = z.infer<typeof PidRefSchema>;

/**
 * One row of a terminal's live process tree (from `ps -o pid,ppid,stat,command`
 * via term_ps). Pure snapshot data — never stored as identity.
 */
export const ProcessInfoSchema = z.object({
  /** OS process id. */
  pid: z.number().int().nonnegative(),
  /** Parent process id. */
  ppid: z.number().int().nonnegative(),
  /** ps STAT column, e.g. 'S+', 'R', 'Ss'. */
  stat: z.string(),
  /** Full command line of the process. */
  command: z.string(),
});
export type ProcessInfo = z.infer<typeof ProcessInfoSchema>;

/**
 * The broker's canonical per-terminal record (SessionService registry value),
 * EXACTLY per ARCHITECTURE §3a.
 *
 * IDENTITY (durable): terminalId, windowId.
 * SNAPSHOT (re-read on demand by term_ps/term_panes): panePid, fgPid, cwd,
 * command. `fgPid` is number|null — null when no foreground child exists
 * (the shell itself is at the prompt).
 */
export const TerminalDescriptorSchema = z.object({
  /** STABLE identity — the durable public handle. */
  terminalId: TerminalIdSchema,
  /** tmux internal window handle ('@7') — durable binding, internal use. */
  windowId: WindowIdSchema,
  /** Human-facing label for the terminal. */
  title: z.string(),
  /** #{pane_pid} — the shell PID. SNAPSHOT. */
  panePid: z.number().int().nonnegative(),
  /** Foreground child PID (pgrep -P panePid), or null at the prompt. SNAPSHOT. */
  fgPid: z.number().int().nonnegative().nullable(),
  /** #{pane_current_path}. SNAPSHOT. */
  cwd: z.string(),
  /** #{pane_current_command}. SNAPSHOT. */
  command: z.string(),
  /** Epoch ms when the terminal was allocated. */
  createdAt: z.number().int().nonnegative(),
});
export type TerminalDescriptor = z.infer<typeof TerminalDescriptorSchema>;
