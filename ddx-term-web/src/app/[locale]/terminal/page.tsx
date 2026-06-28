/**
 * src/app/[locale]/terminal/page.tsx — DDX Terminal UI page.
 *
 * Single page with a tab bar (one tab per terminalId). Clicking a tab:
 *   1. Closes the current WS subscription (XtermClient.dispose()).
 *   2. Opens a new XtermClient for the new terminalId.
 *   3. Fetches GET /api/v1/terminals/:id/snapshot to paint the current frame.
 * This is a WS resubscribe + snapshot, NOT a full reconnect (RESPONSIVENESS §2.8).
 *
 * All user-facing strings via t(). Semantic OKLCH tokens only. Zero `any`.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { TerminalDescriptor } from '@ddx/term-contract';
import { toTerminalId } from '@ddx/term-contract';
import type { ConnectionState, XtermClientCallbacks } from '@/lib/term/xterm-client';
import { XtermClient } from '@/lib/term/xterm-client';

// ── REST helpers ────────────────────────────────────────────────────────────

async function fetchTerminals(): Promise<TerminalDescriptor[]> {
  const res = await fetch('/api/v1/terminals');
  if (!res.ok) throw new Error(`GET /terminals failed: ${res.status}`);
  return res.json() as Promise<TerminalDescriptor[]>;
}

async function fetchSnapshot(id: string): Promise<string> {
  const res = await fetch(`/api/v1/terminals/${id}/snapshot`);
  if (!res.ok) return '';
  // Broker GET /terminals/:id/snapshot returns SnapshotResult { content, cols, rows, ... }.
  const body = await res.json() as { content?: string };
  return body.content ?? '';
}

async function createTerminal(): Promise<TerminalDescriptor> {
  const res = await fetch('/api/v1/terminals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
  if (!res.ok) throw new Error(`POST /terminals failed: ${res.status}`);
  return res.json() as Promise<TerminalDescriptor>;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function TerminalPage() {
  const t = useTranslations('terminal');

  const [terminals, setTerminals] = useState<TerminalDescriptor[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [connState, setConnState] = useState<ConnectionState>('disconnected');
  const [loading, setLoading] = useState(true);

  // Stable ref to the active XtermClient — avoids stale closure issues.
  const clientRef = useRef<XtermClient | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // ── Load terminal list on mount ────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    // Refresh the tab list: initial load + poll, so terminals created out-of-band
    // by the AGENT (via the MCP) appear in the human's tab bar without a reload.
    // The active terminal's xterm/WS is untouched — we only reconcile the list.
    const refresh = (initial: boolean) =>
      fetchTerminals()
        .then((list) => {
          if (cancelled) return;
          setTerminals(list);
          // Auto-select the first terminal only on the very first successful load.
          if (initial && list.length > 0 && list[0]) {
            setActiveId((cur) => cur ?? list[0]!.terminalId);
          }
        })
        .catch(console.error)
        .finally(() => {
          if (initial && !cancelled) setLoading(false);
        });

    void refresh(true);
    const poll = setInterval(() => void refresh(false), 2000);
    return () => { cancelled = true; clearInterval(poll); };
  }, []);

  // ── Switch active terminal (tab click or initial load) ─────────────────

  const switchTo = useCallback(async (id: string, el: HTMLDivElement) => {
    // Tear down the previous client — closes its WS subscription.
    clientRef.current?.dispose();
    clientRef.current = null;

    // Clear the container so xterm can open fresh.
    el.innerHTML = '';

    const terminalId = toTerminalId(id);

    const callbacks: XtermClientCallbacks = {
      onStateChange: (state) => setConnState(state),
      onData: () => { /* keystrokes handled internally by xterm */ },
    };

    const client = new XtermClient(terminalId, el, callbacks);
    clientRef.current = client;

    // Connect WS + attach xterm.
    await client.connect();

    // Snapshot fetch to paint current frame before first live output arrives.
    // RESPONSIVENESS §2.8: this is the tab-switch path — resubscribe + snapshot.
    const snapshot = await fetchSnapshot(id);
    client.restoreSnapshot(snapshot);
  }, []);

  // Re-attach whenever activeId or the container changes.
  useEffect(() => {
    if (!activeId || !containerRef.current) return;
    const el = containerRef.current;
    void switchTo(activeId, el);
    return () => {
      clientRef.current?.dispose();
      clientRef.current = null;
    };
  }, [activeId, switchTo]);

  // ── Create new terminal ────────────────────────────────────────────────

  const handleNew = useCallback(async () => {
    try {
      const descriptor = await createTerminal();
      setTerminals((prev) => [...prev, descriptor]);
      setActiveId(descriptor.terminalId);
    } catch (err) {
      console.error('Failed to create terminal:', err);
    }
  }, []);

  // ── Active terminal descriptor (for status bar) ─────────────────────

  const activeDescriptor = terminals.find((t) => t.terminalId === activeId);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <main className="flex flex-col min-h-dvh bg-background text-foreground">

      {/* ── Tab bar ─────────────────────────────────────────────────── */}
      <nav
        role="tablist"
        aria-label={t('aria.tabBar')}
        className="flex items-center gap-1 px-2 pt-2 bg-surface border-b border-border overflow-x-auto shrink-0"
      >
        {loading ? (
          <span className="text-muted-foreground text-sm px-2 py-1">
            {t('connecting')}
          </span>
        ) : terminals.length === 0 ? (
          <span className="text-muted-foreground text-sm px-2 py-1">
            {t('noTerminals')}
          </span>
        ) : (
          terminals.map((descriptor) => {
            const isActive = descriptor.terminalId === activeId;
            return (
              <button
                key={descriptor.terminalId}
                role="tab"
                aria-selected={isActive}
                aria-label={t('aria.tab', { title: descriptor.title })}
                onClick={() => setActiveId(descriptor.terminalId)}
                className={[
                  'px-3 py-1.5 rounded-t text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'bg-tab-active text-foreground border-b-2 border-primary'
                    : 'bg-tab-inactive text-muted-foreground hover:bg-tab-hover hover:text-foreground',
                ].join(' ')}
              >
                {t('tabLabel', { title: descriptor.title })}
              </button>
            );
          })
        )}

        {/* New terminal button */}
        <button
          onClick={() => void handleNew()}
          className="ml-auto px-3 py-1.5 rounded text-sm text-muted-foreground hover:text-foreground hover:bg-tab-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
          aria-label={t('newTerminal')}
        >
          + {t('newTerminal')}
        </button>
      </nav>

      {/* ── Status bar ──────────────────────────────────────────────── */}
      {activeDescriptor && (
        <div className="flex items-center gap-4 px-3 py-1 bg-surface-muted border-b border-border text-xs text-muted-foreground shrink-0">
          <ConnectionBadge state={connState} t={t} />
          <span>{t('status.command', { command: activeDescriptor.command })}</span>
          {activeDescriptor.fgPid !== null && (
            <span>{t('status.pid', { pid: activeDescriptor.fgPid })}</span>
          )}
        </div>
      )}

      {/* ── xterm container ─────────────────────────────────────────── */}
      <div
        ref={containerRef}
        role="region"
        aria-label={activeDescriptor ? t('aria.terminal', { title: activeDescriptor.title }) : t('pageTitle')}
        className="flex-1 bg-term-bg overflow-hidden min-h-0"
      />

    </main>
  );
}

// ── ConnectionBadge ─────────────────────────────────────────────────────────

interface BadgeProps {
  state: ConnectionState;
  t: ReturnType<typeof useTranslations<'terminal'>>;
}

function ConnectionBadge({ state, t }: BadgeProps) {
  const label: Record<ConnectionState, string> = {
    connecting:   t('connecting'),
    connected:    t('connected'),
    disconnected: t('disconnected'),
    error:        t('errorConnecting'),
  };

  const color: Record<ConnectionState, string> = {
    connecting:   'text-warning',
    connected:    'text-success',
    disconnected: 'text-muted-foreground',
    error:        'text-danger',
  };

  return (
    <span className={`font-medium ${color[state]}`}>
      {label[state]}
    </span>
  );
}
