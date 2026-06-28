/**
 * errors.ts — the thrown error type the verbs raise and the server maps to MCP.
 *
 * A verb throws TermError({code,…}); server.ts catches it and returns the MCP
 * `isError:true` envelope with {code,message,retriable} per MCP-SPEC §4. The
 * retriable flag is canonical per code (TERM_ERROR_RETRIABLE in the contract).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { TERM_ERROR_RETRIABLE, type TermErrorCode } from '@ddx/term-contract';

/** Verb-level error carrying a closed MCP-SPEC §4 code + retriability. */
export class TermError extends Error {
  readonly code: TermErrorCode;
  readonly retriable: boolean;
  constructor(code: TermErrorCode, message: string) {
    super(message);
    this.name = 'TermError';
    this.code = code;
    this.retriable = TERM_ERROR_RETRIABLE[code];
  }
}

/** The serialized error body returned in the MCP envelope. */
export interface TermErrorBody {
  readonly code: TermErrorCode;
  readonly message: string;
  readonly retriable: boolean;
}

/** Coerce any thrown value into a TermErrorBody (unknown → TMUX_ERROR). */
export function toErrorBody(err: unknown): TermErrorBody {
  if (err instanceof TermError) {
    return { code: err.code, message: err.message, retriable: err.retriable };
  }
  const message = err instanceof Error ? err.message : String(err);
  // Anything not a typed TermError is a transient exec failure → retriable.
  return { code: 'TMUX_ERROR', message, retriable: TERM_ERROR_RETRIABLE.TMUX_ERROR };
}
