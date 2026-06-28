/**
 * terminal-map.ts — standalone-mode slug↔windowId map.
 *
 * Authoritative ONLY when no broker is present (shard 06 / registry-ownership):
 * the broker OWNS terminalId↔windowId and the moment a broker attaches its REST
 * registry wins. In standalone mode (agent-only smoke / e2e) this in-memory map
 * is the resolver of record. The default terminal ($DDX_TERM_DEFAULT) is a
 * protected slug that term_destroy must refuse.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { toTerminalId, type TerminalId } from '@ddx/term-contract';

/** One mapping row: a stable terminalId bound to a live tmux windowId. */
export interface TerminalMapEntry {
  readonly terminalId: TerminalId;
  readonly windowId: string;
  readonly panePid: number;
  readonly cwd: string;
}

/**
 * In-memory slug↔window registry for standalone mode. Insertion order is
 * preserved so `list()` is deterministic.
 */
export class TerminalMap {
  private readonly byTerminalId = new Map<TerminalId, TerminalMapEntry>();

  /** Register (or replace) a terminal mapping. */
  set(entry: TerminalMapEntry): void {
    this.byTerminalId.set(entry.terminalId, entry);
  }

  /** Resolve a terminalId → its entry, or undefined if unknown. */
  get(terminalId: TerminalId): TerminalMapEntry | undefined {
    return this.byTerminalId.get(terminalId);
  }

  /** Whether a terminalId is currently mapped. */
  has(terminalId: TerminalId): boolean {
    return this.byTerminalId.has(terminalId);
  }

  /** Find an existing entry by raw slug (idempotent term_create). */
  findBySlug(slug: string): TerminalMapEntry | undefined {
    const id = toTerminalId(slug);
    return this.byTerminalId.get(id);
  }

  /** Remove a mapping (term_destroy). Returns true if it existed. */
  delete(terminalId: TerminalId): boolean {
    return this.byTerminalId.delete(terminalId);
  }

  /** All mappings in insertion order. */
  list(): TerminalMapEntry[] {
    return [...this.byTerminalId.values()];
  }

  /** Current terminal count (for the MAX_TERMINALS guard). */
  get size(): number {
    return this.byTerminalId.size;
  }

  /**
   * Allocate the next auto slug 'tNN' not already in use (term_create with no
   * name). Numbering is 1-based and zero-padded to two digits.
   */
  nextAutoSlug(): string {
    for (let n = 1; n < 1000; n += 1) {
      const slug = `t${String(n).padStart(2, '0')}`;
      if (!this.has(toTerminalId(slug))) return slug;
    }
    throw new Error('terminal-map: exhausted auto-slug space');
  }
}
