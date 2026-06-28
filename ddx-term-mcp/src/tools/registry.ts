/**
 * registry.ts — the verb table: name → handler + description, and `dispatch`.
 *
 * Each handler is a pure (ctx, validatedInput) → Promise<output>. The server
 * validates the input with the contract schema BEFORE calling dispatch, so the
 * narrowed input type per verb is sound. Keeping the table here keeps server.ts
 * thin and gives the no-pty/exhaustiveness tests one import.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import type {
  TermCreateInput,
  TermDestroyInput,
  TermListInput,
  TermPanesInput,
  TermPsInput,
  TermReadInput,
  TermSendInput,
  TermSignalInput,
  TermSnapshotInput,
  TermToolName,
  TermWaitForInput,
} from '@ddx/term-contract';

import type { ToolContext } from '../context.js';
import { termCreate } from './term-create.tool.js';
import { termDestroy } from './term-destroy.tool.js';
import { termList } from './term-list.tool.js';
import { termPanes } from './term-panes.tool.js';
import { termPs } from './term-ps.tool.js';
import { termRead } from './term-read.tool.js';
import { termSend } from './term-send.tool.js';
import { termSignal } from './term-signal.tool.js';
import { termSnapshot } from './term-snapshot.tool.js';
import { termWaitFor } from './term-wait-for.tool.js';

/** One-line agent-facing description per verb (the ListTools `description`). */
export const TERM_TOOL_DESCRIPTIONS: Readonly<Record<TermToolName, string>> = {
  term_create: 'Allocate a new terminal (tmux window). Idempotent on an existing slug.',
  term_list: 'List all terminals with live process snapshots (panePid, fgPid, command, cwd).',
  term_destroy: 'Close a terminal and the processes in it. The default terminal is protected.',
  term_send: 'Type literal text into a terminal; set enter=true to send a separate Enter key.',
  term_read: 'Return new output since the last read (delta) by default; since="all" for the full capture.',
  term_wait_for: 'Block until a regex matches the visible pane or timeout — replaces fixed sleeps.',
  term_signal: 'Send a control key (C-c/C-d/C-z) to the foreground, or kill a specific child pid.',
  term_ps: 'Resolve the terminal\'s live process tree (panePid, fgPid, ps rows) for pid targeting.',
  term_panes: 'List the panes (splits) within a terminal with their dimensions and command.',
  term_snapshot: 'Capture the visible viewport grid (cols×lines) — what is on screen right now.',
};

/**
 * Dispatch a validated tool call to its handler. The `input` is the contract
 * schema's parsed output for `name`; we narrow per-verb. Returns the verb's
 * output object (JSON-serialized by the server).
 */
export async function dispatch(ctx: ToolContext, name: TermToolName, input: unknown): Promise<unknown> {
  switch (name) {
    case 'term_create':
      return termCreate(ctx, input as TermCreateInput);
    case 'term_list':
      return termList(ctx, input as TermListInput);
    case 'term_destroy':
      return termDestroy(ctx, input as TermDestroyInput);
    case 'term_send':
      return termSend(ctx, input as TermSendInput);
    case 'term_read':
      return termRead(ctx, input as TermReadInput);
    case 'term_wait_for':
      return termWaitFor(ctx, input as TermWaitForInput);
    case 'term_signal':
      return termSignal(ctx, input as TermSignalInput);
    case 'term_ps':
      return termPs(ctx, input as TermPsInput);
    case 'term_panes':
      return termPanes(ctx, input as TermPanesInput);
    case 'term_snapshot':
      return termSnapshot(ctx, input as TermSnapshotInput);
    default: {
      // Exhaustiveness: every TermToolName is handled above.
      const exhaustive: never = name;
      throw new Error(`unhandled tool: ${String(exhaustive)}`);
    }
  }
}
