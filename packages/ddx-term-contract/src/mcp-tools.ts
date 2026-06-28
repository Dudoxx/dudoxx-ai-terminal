/**
 * mcp-tools.ts — the MCP agent-channel I/O contract.
 *
 * One zod INPUT + one zod OUTPUT schema per verb (MCP-SPEC §3). The stdio MCP
 * server (ddx-term-mcp) and any client import these — schemas are NEVER
 * duplicated downstream (_invariants.md).
 *
 * Conventions (MCP-SPEC §2a / §3):
 *   - Per-terminal verbs take an OPTIONAL terminalId (server defaults it to
 *     $DDX_TERM_DEFAULT). Lifecycle verbs that ADDRESS a terminal (term_destroy)
 *     take a REQUIRED terminalId.
 *   - Verbs ADDRESS by terminalId (identity); they SIGNAL/observe by pid
 *     (snapshot). Conflating them is forbidden (invariant 5 / FM#4).
 *   - The error model is ONE shared discriminated union keyed on the MCP-SPEC
 *     §4 `code` enum + retriable:boolean.
 *
 * Pure types + zod only. No runtime tmux logic, no node-pty.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { z } from 'zod/v4';

import { ProcessInfoSchema, TerminalIdSchema } from './terminal';

// ── shared error model (MCP-SPEC §4) ──────────────────────────────────────

/**
 * The closed set of MCP error codes (MCP-SPEC §4). `retriable` is fixed per
 * code: only TMUX_ERROR (transient tmux exec failure) is retriable.
 */
export const TermErrorCodeSchema = z.enum([
  'SESSION_NOT_FOUND',
  'TERMINAL_NOT_FOUND',
  'TERMINAL_PROTECTED',
  'MAX_TERMINALS',
  'PID_NOT_IN_TERMINAL',
  'COMMAND_DENIED',
  'INVALID_REGEX',
  'TMUX_ERROR',
  'PORT_CONFLICT',
  'STACK_LAUNCH_FAILED',
]);
export type TermErrorCode = z.infer<typeof TermErrorCodeSchema>;

/** Canonical retriability per code (only transient tmux failures retry). */
export const TERM_ERROR_RETRIABLE: Readonly<Record<TermErrorCode, boolean>> = {
  SESSION_NOT_FOUND: false,
  TERMINAL_NOT_FOUND: false,
  TERMINAL_PROTECTED: false,
  MAX_TERMINALS: false,
  PID_NOT_IN_TERMINAL: false,
  COMMAND_DENIED: false,
  INVALID_REGEX: false,
  TMUX_ERROR: true,
  PORT_CONFLICT: false,
  STACK_LAUNCH_FAILED: false,
};

/**
 * Shared error shape. Returned with MCP `isError: true`. A discriminated union
 * on `code` so each branch is independently matchable; every branch carries a
 * human message + the retriable flag.
 */
export const TermErrorSchema = z.discriminatedUnion('code', [
  z.object({ code: z.literal('SESSION_NOT_FOUND'), message: z.string(), retriable: z.literal(false) }),
  z.object({ code: z.literal('TERMINAL_NOT_FOUND'), message: z.string(), retriable: z.literal(false) }),
  z.object({ code: z.literal('TERMINAL_PROTECTED'), message: z.string(), retriable: z.literal(false) }),
  z.object({ code: z.literal('MAX_TERMINALS'), message: z.string(), retriable: z.literal(false) }),
  z.object({ code: z.literal('PID_NOT_IN_TERMINAL'), message: z.string(), retriable: z.literal(false) }),
  z.object({ code: z.literal('COMMAND_DENIED'), message: z.string(), retriable: z.literal(false) }),
  z.object({ code: z.literal('INVALID_REGEX'), message: z.string(), retriable: z.literal(false) }),
  z.object({ code: z.literal('TMUX_ERROR'), message: z.string(), retriable: z.literal(true) }),
  z.object({ code: z.literal('PORT_CONFLICT'), message: z.string(), retriable: z.literal(false) }),
  z.object({ code: z.literal('STACK_LAUNCH_FAILED'), message: z.string(), retriable: z.literal(false) }),
]);
export type TermError = z.infer<typeof TermErrorSchema>;

// ── lifecycle verbs ────────────────────────────────────────────────────────

/** term_create — allocate a new terminal (tmux window). */
export const TermCreateInputSchema = z.object({
  /** Slug for the new terminal ('term-<name>'); omitted → auto 'tNN'. */
  name: z.string().min(1).optional(),
  /** Working directory for the new window (-c). */
  cwd: z.string().optional(),
});
export type TermCreateInput = z.infer<typeof TermCreateInputSchema>;

export const TermCreateOutputSchema = z.object({
  terminalId: TerminalIdSchema,
  windowId: z.string().min(1),
  panePid: z.number().int().nonnegative(),
  cwd: z.string(),
  /** false when an existing slug was returned idempotently. */
  created: z.boolean(),
});
export type TermCreateOutput = z.infer<typeof TermCreateOutputSchema>;

/** term_list — enumerate all terminals with live process snapshots. */
export const TermListInputSchema = z.object({});
export type TermListInput = z.infer<typeof TermListInputSchema>;

/** One terminal row in a term_list result (snapshot fields included). */
export const TermListEntrySchema = z.object({
  terminalId: TerminalIdSchema,
  windowId: z.string().min(1),
  title: z.string(),
  panePid: z.number().int().nonnegative(),
  fgPid: z.number().int().nonnegative().nullable(),
  command: z.string(),
  cwd: z.string(),
  /** Whether this is the tmux-active window. Optional: a freshly-created
   *  terminal's response may omit it (the broker may not yet know focus state);
   *  defaults to false so create/list responses validate without it. */
  active: z.boolean().default(false),
});
export type TermListEntry = z.infer<typeof TermListEntrySchema>;

export const TermListOutputSchema = z.object({
  terminals: z.array(TermListEntrySchema),
});
export type TermListOutput = z.infer<typeof TermListOutputSchema>;

/** term_destroy — close a terminal (terminalId REQUIRED — it addresses one). */
export const TermDestroyInputSchema = z.object({
  terminalId: TerminalIdSchema,
});
export type TermDestroyInput = z.infer<typeof TermDestroyInputSchema>;

export const TermDestroyOutputSchema = z.object({
  ok: z.literal(true),
  terminalId: TerminalIdSchema,
});
export type TermDestroyOutput = z.infer<typeof TermDestroyOutputSchema>;

// ── per-terminal verbs (optional terminalId → server default) ──────────────

/** term_send — inject literal keystrokes into a terminal's PTY. */
export const TermSendInputSchema = z.object({
  /** Optional — server defaults to $DDX_TERM_DEFAULT. */
  terminalId: TerminalIdSchema.optional(),
  /** Literal text typed verbatim via send-keys -l. REQUIRED. */
  text: z.string(),
  /** Send a separate Enter key event after the text. */
  enter: z.boolean().optional().default(false),
});
export type TermSendInput = z.infer<typeof TermSendInputSchema>;

export const TermSendOutputSchema = z.object({
  ok: z.literal(true),
  terminalId: TerminalIdSchema,
});
export type TermSendOutput = z.infer<typeof TermSendOutputSchema>;

/** term_read — return the scrollback delta (default) or full visible pane. */
export const TermReadInputSchema = z.object({
  terminalId: TerminalIdSchema.optional(),
  /** 'last' = delta since this terminal's read-cursor; 'all' = full capture. */
  since: z.enum(['last', 'all']).optional().default('last'),
  /** Optional cap on returned lines (bounded by DDX_TERM_MAX_READ_LINES). */
  lines: z.number().int().positive().optional(),
});
export type TermReadInput = z.infer<typeof TermReadInputSchema>;

export const TermReadOutputSchema = z.object({
  terminalId: TerminalIdSchema,
  text: z.string(),
  /** First captured line index (inclusive). */
  fromLine: z.number().int().nonnegative(),
  /** Last captured line index (inclusive). */
  toLine: z.number().int().nonnegative(),
  /** Whether the result was capped by the max-read guard. */
  truncated: z.boolean(),
});
export type TermReadOutput = z.infer<typeof TermReadOutputSchema>;

/** term_wait_for — block until a regex matches the pane or timeout. */
export const TermWaitForInputSchema = z.object({
  terminalId: TerminalIdSchema.optional(),
  /** Regex source matched against the captured pane. REQUIRED. */
  pattern: z.string(),
  /** Timeout in ms before giving up. */
  timeoutMs: z.number().int().positive().optional().default(30000),
});
export type TermWaitForInput = z.infer<typeof TermWaitForInputSchema>;

export const TermWaitForOutputSchema = z.object({
  terminalId: TerminalIdSchema,
  matched: z.boolean(),
  /** Why the wait ended. */
  reason: z.enum(['pattern', 'timeout']),
  /** The line that matched, when matched. */
  line: z.string().optional(),
  elapsedMs: z.number().int().nonnegative(),
});
export type TermWaitForOutput = z.infer<typeof TermWaitForOutputSchema>;

/**
 * term_signal — interrupt/EOF/suspend the foreground OR signal a specific pid.
 * Default (no pid) sends a tmux key-name to the foreground; with `pid` it
 * `kill`s that process AFTER validating it belongs to the terminal's tree.
 */
export const TermSignalInputSchema = z.object({
  terminalId: TerminalIdSchema.optional(),
  /** tmux key-name or signal token ('C-c', 'C-d', 'C-z', 'C-\\', …). REQUIRED. */
  signal: z.string(),
  /** Target a specific child process (validated ∈ terminal tree first). */
  pid: z.number().int().nonnegative().optional(),
});
export type TermSignalInput = z.infer<typeof TermSignalInputSchema>;

export const TermSignalOutputSchema = z.object({
  ok: z.literal(true),
  terminalId: TerminalIdSchema,
  /** Present only when a specific pid was targeted. */
  targetedPid: z.number().int().nonnegative().optional(),
});
export type TermSignalOutput = z.infer<typeof TermSignalOutputSchema>;

/** term_ps — resolve the live process tree for a terminal (pid introspection). */
export const TermPsInputSchema = z.object({
  terminalId: TerminalIdSchema.optional(),
});
export type TermPsInput = z.infer<typeof TermPsInputSchema>;

export const TermPsOutputSchema = z.object({
  terminalId: TerminalIdSchema,
  panePid: z.number().int().nonnegative(),
  fgPid: z.number().int().nonnegative().nullable(),
  processes: z.array(ProcessInfoSchema),
});
export type TermPsOutput = z.infer<typeof TermPsOutputSchema>;

/** term_panes — list panes (splits) within a terminal + their dimensions. */
export const TermPanesInputSchema = z.object({
  terminalId: TerminalIdSchema.optional(),
});
export type TermPanesInput = z.infer<typeof TermPanesInputSchema>;

export const TermPaneSchema = z.object({
  /** tmux pane id ('%3'). */
  id: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  command: z.string(),
});
export type TermPane = z.infer<typeof TermPaneSchema>;

export const TermPanesOutputSchema = z.object({
  terminalId: TerminalIdSchema,
  panes: z.array(TermPaneSchema),
});
export type TermPanesOutput = z.infer<typeof TermPanesOutputSchema>;

/**
 * term_snapshot — full VISIBLE viewport grid (capture-pane WITHOUT -S). Resets
 * the terminal's read-cursor to tail. The cols×lines grid the human sees now.
 */
export const TermSnapshotInputSchema = z.object({
  terminalId: TerminalIdSchema.optional(),
  /** Optional cap on captured lines (bounded by DDX_TERM_MAX_READ_LINES). */
  lines: z.number().int().positive().optional(),
});
export type TermSnapshotInput = z.infer<typeof TermSnapshotInputSchema>;

export const TermSnapshotOutputSchema = z.object({
  terminalId: TerminalIdSchema,
  /** Grid width in columns (#{pane_width}). */
  cols: z.number().int().positive(),
  /** Grid height in rows (#{pane_height}). */
  lines: z.number().int().positive(),
  /** The visible grid, lines joined by '\n'. */
  grid: z.string(),
  /** Whether `grid` includes ANSI colour/style escapes (capture -e). */
  withAnsi: z.boolean(),
});
export type TermSnapshotOutput = z.infer<typeof TermSnapshotOutputSchema>;

// ── verb registry (handy for the server + exhaustiveness tests) ────────────

/** The canonical verb names. */
export const TERM_TOOL_NAMES = [
  'term_create',
  'term_list',
  'term_destroy',
  'term_send',
  'term_read',
  'term_wait_for',
  'term_signal',
  'term_ps',
  'term_panes',
  'term_snapshot',
] as const;
export type TermToolName = (typeof TERM_TOOL_NAMES)[number];

/** Input schema keyed by verb name (server uses this to validate requests). */
export const TERM_TOOL_INPUT_SCHEMAS = {
  term_create: TermCreateInputSchema,
  term_list: TermListInputSchema,
  term_destroy: TermDestroyInputSchema,
  term_send: TermSendInputSchema,
  term_read: TermReadInputSchema,
  term_wait_for: TermWaitForInputSchema,
  term_signal: TermSignalInputSchema,
  term_ps: TermPsInputSchema,
  term_panes: TermPanesInputSchema,
  term_snapshot: TermSnapshotInputSchema,
} as const;

/** Output schema keyed by verb name. */
export const TERM_TOOL_OUTPUT_SCHEMAS = {
  term_create: TermCreateOutputSchema,
  term_list: TermListOutputSchema,
  term_destroy: TermDestroyOutputSchema,
  term_send: TermSendOutputSchema,
  term_read: TermReadOutputSchema,
  term_wait_for: TermWaitForOutputSchema,
  term_signal: TermSignalOutputSchema,
  term_ps: TermPsOutputSchema,
  term_panes: TermPanesOutputSchema,
  term_snapshot: TermSnapshotOutputSchema,
} as const;
