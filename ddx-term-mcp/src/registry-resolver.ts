/**
 * registry-resolver.ts — the ONE interface, two impls (shard 06).
 *
 * Resolving terminalId→windowId has a single owner question: who holds the
 * canonical registry?
 *   - broker-attached (default in dev): the BROKER owns it; MCP resolves by
 *     querying broker REST `GET /terminals`. The broker stays authoritative.
 *   - standalone (MCP without a broker, e.g. agent-only smoke / e2e): MCP keeps
 *     its OWN slug↔window map in terminal-map.ts and is authoritative ONLY here.
 *
 * The MOMENT a broker is present, broker REST wins (invariant: never let the
 * local map diverge silently). Both impls satisfy `RegistryResolver` so the
 * verbs never branch on mode.
 *
 * The read-cursor is MCP-local in BOTH modes and lives outside this interface.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import {
  TermListEntrySchema,
  toTerminalId,
  type TerminalId,
  type TermListEntry,
} from '@ddx/term-contract';

import type { TmuxClient } from './tmux/tmux.client.js';
import type { TerminalMap, TerminalMapEntry } from './terminal-map.js';

/** Thrown when a terminalId is not in the registry (→ TERMINAL_NOT_FOUND). */
export class TerminalNotFoundError extends Error {
  constructor(readonly terminalId: TerminalId) {
    super(`terminal not found: ${terminalId}`);
    this.name = 'TerminalNotFoundError';
  }
}

/** What a verb needs to address a terminal: the resolved windowId + panePid. */
export interface ResolvedTerminal {
  readonly terminalId: TerminalId;
  readonly windowId: string;
  readonly panePid: number;
}

/**
 * The single resolution contract the verbs depend on. Both the local-map and
 * broker-REST impls satisfy it; the verbs are mode-agnostic.
 */
export interface RegistryResolver {
  /** terminalId → windowId+panePid, or throw TerminalNotFoundError. */
  resolve(terminalId: TerminalId): Promise<ResolvedTerminal>;
  /** Allocate a terminal (tmux window) and register it. Idempotent on slug. */
  create(name: string | undefined, cwd: string | undefined): Promise<{ resolved: ResolvedTerminal; cwd: string; created: boolean }>;
  /** Free a terminal from the registry (after tmux kill-window). */
  release(terminalId: TerminalId): Promise<void>;
  /** Enumerate all terminals as contract TermListEntry rows. */
  list(): Promise<TermListEntry[]>;
  /** Current terminal count (for the MAX_TERMINALS guard). */
  count(): Promise<number>;
}

// ── standalone: the local slug↔window map is authoritative ──────────────────

/**
 * Standalone resolver. Owns its own slug↔window map; allocates windows directly
 * via tmux. Authoritative only when no broker is present.
 */
export class LocalMapResolver implements RegistryResolver {
  constructor(
    private readonly tmux: TmuxClient,
    private readonly map: TerminalMap,
  ) {}

  async resolve(terminalId: TerminalId): Promise<ResolvedTerminal> {
    const entry = this.map.get(terminalId);
    if (entry === undefined) throw new TerminalNotFoundError(terminalId);
    return { terminalId, windowId: entry.windowId, panePid: entry.panePid };
  }

  async create(
    name: string | undefined,
    cwd: string | undefined,
  ): Promise<{ resolved: ResolvedTerminal; cwd: string; created: boolean }> {
    const slug = name ?? this.map.nextAutoSlug();
    const existing = this.map.findBySlug(slug);
    if (existing !== undefined) {
      return {
        resolved: { terminalId: existing.terminalId, windowId: existing.windowId, panePid: existing.panePid },
        cwd: existing.cwd,
        created: false,
      };
    }
    const win = await this.tmux.newWindow(slug, cwd);
    const terminalId = toTerminalId(slug);
    const entry: TerminalMapEntry = { terminalId, windowId: win.windowId, panePid: win.panePid, cwd: win.cwd };
    this.map.set(entry);
    return {
      resolved: { terminalId, windowId: win.windowId, panePid: win.panePid },
      cwd: win.cwd,
      created: true,
    };
  }

  async release(terminalId: TerminalId): Promise<void> {
    this.map.delete(terminalId);
  }

  async list(): Promise<TermListEntry[]> {
    const windows = await this.tmux.listWindows();
    const byWindowId = new Map(windows.map((w) => [w.windowId, w]));
    const rows: TermListEntry[] = [];
    for (const entry of this.map.list()) {
      const live = byWindowId.get(entry.windowId);
      const children = live !== undefined ? await this.tmux.childPids(live.panePid) : [];
      rows.push({
        terminalId: entry.terminalId,
        windowId: entry.windowId,
        title: live?.windowName ?? String(entry.terminalId),
        panePid: live?.panePid ?? entry.panePid,
        fgPid: children[0] ?? null,
        command: live?.command ?? '',
        cwd: live?.cwd ?? entry.cwd,
        active: live?.active ?? false,
      });
    }
    return rows;
  }

  async count(): Promise<number> {
    return this.map.size;
  }
}

// ── broker-attached: broker REST is authoritative ───────────────────────────

/** Minimal fetch surface so the resolver is testable without a live broker. */
export type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/**
 * Broker-attached resolver. The broker OWNS the registry; this resolver queries
 * REST `GET /terminals` (and POST/DELETE for lifecycle). When a broker is up its
 * registry wins over any local map.
 */
export class BrokerRestResolver implements RegistryResolver {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchLike,
  ) {}

  private async getTerminals(): Promise<TermListEntry[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/terminals`);
    if (!res.ok) throw new Error(`broker GET /terminals failed: ${res.status}`);
    const body = await res.json();
    const parsed = TermListEntrySchema.array().safeParse(
      typeof body === 'object' && body !== null && 'terminals' in body
        ? (body as { terminals: unknown }).terminals
        : body,
    );
    if (!parsed.success) throw new Error(`broker /terminals shape invalid: ${parsed.error.message}`);
    return parsed.data;
  }

  async resolve(terminalId: TerminalId): Promise<ResolvedTerminal> {
    const rows = await this.getTerminals();
    const row = rows.find((r) => r.terminalId === terminalId);
    if (row === undefined) throw new TerminalNotFoundError(terminalId);
    return { terminalId, windowId: row.windowId, panePid: row.panePid };
  }

  async create(
    name: string | undefined,
    cwd: string | undefined,
  ): Promise<{ resolved: ResolvedTerminal; cwd: string; created: boolean }> {
    const res = await this.fetchImpl(`${this.baseUrl}/terminals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, cwd }),
    });
    if (!res.ok) throw new Error(`broker POST /terminals failed: ${res.status}`);
    const body = await res.json();
    const row = TermListEntrySchema.safeParse(body);
    if (!row.success) throw new Error(`broker POST /terminals shape invalid: ${row.error.message}`);
    return {
      resolved: { terminalId: row.data.terminalId, windowId: row.data.windowId, panePid: row.data.panePid },
      cwd: row.data.cwd,
      created: true,
    };
  }

  async release(terminalId: TerminalId): Promise<void> {
    const res = await this.fetchImpl(`${this.baseUrl}/terminals/${encodeURIComponent(String(terminalId))}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 404) throw new Error(`broker DELETE /terminals failed: ${res.status}`);
  }

  async list(): Promise<TermListEntry[]> {
    return this.getTerminals();
  }

  async count(): Promise<number> {
    return (await this.getTerminals()).length;
  }
}
