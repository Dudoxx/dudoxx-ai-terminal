/**
 * context.ts — the ToolContext every verb handler receives + env config.
 *
 * The context bundles the resolved dependencies (resolver, cursor, tmux client,
 * allow-list, config) so each verb is a pure function of (ctx, input). The
 * config is read once from the env table (MCP-SPEC §2) at server boot.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { toTerminalId, type TerminalId } from '@ddx/term-contract';

import type { AllowList } from './allow-list.js';
import type { ReadCursor } from './read-cursor.js';
import type { RegistryResolver } from './registry-resolver.js';
import type { TmuxClient } from './tmux/tmux.client.js';

/** Resolved server configuration (MCP-SPEC §2 env table). */
export interface TermConfig {
  readonly socket: string;
  readonly session: string;
  /** terminalId used when a verb omits terminalId. */
  readonly defaultTerminal: TerminalId;
  readonly allowlistPath: string | undefined;
  readonly maxReadLines: number;
  readonly maxTerminals: number;
}

/** The dependency bag passed to every verb handler. */
export interface ToolContext {
  readonly tmux: TmuxClient;
  readonly resolver: RegistryResolver;
  readonly cursor: ReadCursor;
  readonly allowList: AllowList;
  readonly config: TermConfig;
}

/** Read the config from process.env applying the MCP-SPEC §2 defaults. */
export function loadConfig(env: NodeJS.ProcessEnv): TermConfig {
  const intOr = (raw: string | undefined, fallback: number): number => {
    if (raw === undefined) return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    socket: env['DDX_TERM_SOCKET'] ?? '/tmp/ddx-term.sock',
    session: env['DDX_TERM_SESSION'] ?? 'ddx-shared',
    defaultTerminal: toTerminalId(env['DDX_TERM_DEFAULT'] ?? 't01'),
    allowlistPath: env['DDX_TERM_ALLOWLIST'],
    maxReadLines: intOr(env['DDX_TERM_MAX_READ_LINES'], 2000),
    // 10 = the canonical pty-safe ceiling (matches the broker's MAX_TERMINALS).
    // Each terminal holds a shell pty; unbounded growth exhausts the macOS pty
    // pool (ptmx_max=511). The broker enforces the same cap as the source of
    // truth — this MCP-side guard fails fast before the REST round-trip.
    maxTerminals: intOr(env['DDX_TERM_MAX_TERMINALS'], 10),
  };
}

/** Resolve an optional verb terminalId to the concrete one (default if omitted). */
export function resolveTerminalId(ctx: ToolContext, terminalId: TerminalId | undefined): TerminalId {
  return terminalId ?? ctx.config.defaultTerminal;
}
