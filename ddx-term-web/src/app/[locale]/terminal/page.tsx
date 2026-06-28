/**
 * src/app/[locale]/terminal/page.tsx — DDX Terminal UI page.
 *
 * Three-zone layout: a collapsible left side panel (session nav + appearance
 * controls) beside the active xterm view with a status bar. Selecting a session:
 *   1. Closes the current WS subscription (XtermClient.dispose()).
 *   2. Opens a new XtermClient for the new terminalId (with current appearance).
 *   3. Fetches GET /api/v1/terminals/:id/snapshot to paint the current frame.
 * This is a WS resubscribe + snapshot, NOT a full reconnect (RESPONSIVENESS §2.8).
 *
 * Appearance (font size/family, color theme) is read from the localStorage store
 * and applied LIVE to the active terminal via applyAppearance() — never a
 * reconnect, so scrollback and the WS subscription survive a theme/size change.
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
import { useTermAppearance } from '@/lib/term/settings-store';
import { TerminalSidePanel } from '@/components/term/TerminalSidePanel';

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

async function createTerminal(title?: string): Promise<TerminalDescriptor> {
  const body = title ? { title } : {};
  const res = await fetch('/api/v1/terminals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`POST /terminals failed: ${res.status}`);
  return res.json() as Promise<TerminalDescriptor>;
}

async function destroyTerminal(id: string): Promise<void> {
  const res = await fetch(`/api/v1/terminals/${id}`, { method: 'DELETE' });
  // 204 No Content on success; DELETE is idempotent broker-side (already-gone → 204).
  if (!res.ok && res.status !== 404) throw new Error(`DELETE /terminals/${id} failed: ${res.status}`);
}

async function renameTerminal(id: string, title: string): Promise<TerminalDescriptor> {
  const res = await fetch(`/api/v1/terminals/${id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`PATCH /terminals/${id} failed: ${res.status}`);
  return res.json() as Promise<TerminalDescriptor>;
}

const COLLAPSE_KEY = 'ddx.terminal.sidePanelCollapsed';

// ── Component ───────────────────────────────────────────────────────────────

export default function TerminalPage(): React.JSX.Element {
  const t = useTranslations('terminal');
  const { appearance } = useTermAppearance();

  const [terminals, setTerminals] = useState<TerminalDescriptor[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [connState, setConnState] = useState<ConnectionState>('disconnected');
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  // Stable ref to the active XtermClient — avoids stale closure issues.
  const clientRef = useRef<XtermClient | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // The appearance to hand a freshly-constructed client. Kept in a ref so
  // switchTo() always reads the latest without being a dependency (which would
  // re-run the switch effect — and thus reconnect — on every appearance change).
  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;

  // ── Restore collapsed state ────────────────────────────────────────────
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch { /* storage disabled — default expanded */ }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // ── Load terminal list on mount ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    // Refresh the tab list: initial load + poll, so terminals created out-of-band
    // by the AGENT (via the MCP) appear in the human's session list without a
    // reload. The active terminal's xterm/WS is untouched — we only reconcile.
    const refresh = (initial: boolean) =>
      fetchTerminals()
        .then((list) => {
          if (cancelled) return;
          setTerminals(list);
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

  // ── Switch active terminal (selection or initial load) ─────────────────
  const switchTo = useCallback(async (id: string, el: HTMLDivElement) => {
    clientRef.current?.dispose();
    clientRef.current = null;
    el.innerHTML = '';

    const terminalId = toTerminalId(id);
    const callbacks: XtermClientCallbacks = {
      onStateChange: (state) => setConnState(state),
      onData: () => { /* keystrokes handled internally by xterm */ },
      onReconnect: () => fetchSnapshot(id),
      // Shell exited (e.g. `exit`): the broker sent window-close for this tab's
      // window. Drop it from the list and select a neighbor so the UI never
      // shows a dead terminal. The frame carries windowId; this client IS the
      // closed terminal, so we remove by the id it was opened with.
      onExit: () => removeTerminal(id),
    };

    // Construct with the CURRENT appearance so the first paint already matches
    // the user's persisted font/theme — no flash of default styling.
    const client = new XtermClient(terminalId, el, callbacks, appearanceRef.current);
    clientRef.current = client;

    await client.connect();
    const snapshot = await fetchSnapshot(id);
    client.restoreSnapshot(snapshot);
  }, []);

  useEffect(() => {
    if (!activeId || !containerRef.current) return;
    const el = containerRef.current;
    void switchTo(activeId, el);
    return () => {
      clientRef.current?.dispose();
      clientRef.current = null;
    };
  }, [activeId, switchTo]);

  // ── Apply appearance changes LIVE to the active terminal ────────────────
  // Separate from switchTo so a font/theme change re-styles in place instead of
  // reconnecting (which would drop scrollback + re-fetch the snapshot).
  useEffect(() => {
    clientRef.current?.applyAppearance(appearance);
  }, [appearance]);

  // ── Remove a terminal from local state, selecting a neighbor ────────────
  // Shared by onExit (shell exited) and handleKill (user killed it): drop the id
  // and, if it was active, move selection to the nearest surviving tab (or null).
  const removeTerminal = useCallback((id: string) => {
    setTerminals((prev) => {
      const next = prev.filter((term) => term.terminalId !== id);
      setActiveId((cur) => {
        if (cur !== id) return cur;
        const idx = prev.findIndex((term) => term.terminalId === id);
        const neighbor = next[Math.min(idx, next.length - 1)];
        return neighbor ? neighbor.terminalId : null;
      });
      return next;
    });
  }, []);

  // ── Create new terminal ────────────────────────────────────────────────
  // Cmd/Ctrl+N and the +New button pass an adequate auto title (Terminal N) so a
  // fresh terminal is never an unnamed "bash"/"zsh" — the broker slugifies it to
  // the terminalId and labels the tmux window with it.
  const handleNew = useCallback(async () => {
    try {
      const title = t('newTerminalTitle', { n: terminals.length + 1 });
      const descriptor = await createTerminal(title);
      setTerminals((prev) => [...prev, descriptor]);
      setActiveId(descriptor.terminalId);
    } catch (err) {
      console.error('Failed to create terminal:', err);
    }
  }, [t, terminals.length]);

  // ── Kill a terminal (DELETE) ────────────────────────────────────────────
  const handleKill = useCallback(async (id: string) => {
    // Optimistically drop it; the DELETE is idempotent broker-side. On failure
    // the 2s poll re-adds it, so a transient error self-heals.
    removeTerminal(id);
    try {
      await destroyTerminal(id);
    } catch (err) {
      console.error('Failed to kill terminal:', err);
    }
  }, [removeTerminal]);

  // ── Rename a terminal (PATCH) ───────────────────────────────────────────
  const handleRename = useCallback(async (id: string, title: string) => {
    try {
      const updated = await renameTerminal(id, title);
      setTerminals((prev) =>
        prev.map((term) => (term.terminalId === id ? updated : term)),
      );
    } catch (err) {
      console.error('Failed to rename terminal:', err);
    }
  }, []);

  // ── Keyboard shortcuts: Cmd/Ctrl+K clear · Cmd/Ctrl+N new ───────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === 'k') {
        e.preventDefault();
        clientRef.current?.clear();
      } else if (key === 'n') {
        // Browser may intercept Cmd+N for a new window before this fires; the
        // +New button is the guaranteed path. We still preventDefault to claim
        // it where the browser allows (e.g. focused PWA / standalone window).
        e.preventDefault();
        void handleNew();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleNew]);

  const activeDescriptor = terminals.find((term) => term.terminalId === activeId);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <main className="flex h-dvh min-h-0 bg-background text-foreground">

      {/* ── Left side panel: session nav + appearance ─────────────────── */}
      <TerminalSidePanel
        terminals={terminals}
        activeId={activeId}
        collapsed={collapsed}
        loading={loading}
        onSelect={setActiveId}
        onCreate={() => void handleNew()}
        onRename={(id, title) => void handleRename(id, title)}
        onKill={(id) => void handleKill(id)}
        onToggleCollapsed={toggleCollapsed}
      />

      {/* ── Terminal area ─────────────────────────────────────────────── */}
      <section className="flex min-w-0 flex-1 flex-col">

        {/* Status bar */}
        {activeDescriptor && (
          <div className="flex items-center gap-4 px-3 py-1 bg-surface-muted text-xs text-muted-foreground shrink-0 shadow-elev-1">
            <ConnectionBadge state={connState} t={t} />
            <span>{t('status.command', { command: activeDescriptor.command })}</span>
            {activeDescriptor.fgPid !== null && (
              <span>{t('status.pid', { pid: activeDescriptor.fgPid })}</span>
            )}
          </div>
        )}

        {/* xterm container */}
        <div
          ref={containerRef}
          role="region"
          aria-label={activeDescriptor ? t('aria.terminal', { title: activeDescriptor.title }) : t('pageTitle')}
          className="flex-1 bg-term-bg overflow-hidden min-h-0"
        />
      </section>
    </main>
  );
}

// ── ConnectionBadge ─────────────────────────────────────────────────────────

interface BadgeProps {
  state: ConnectionState;
  t: ReturnType<typeof useTranslations<'terminal'>>;
}

function ConnectionBadge({ state, t }: BadgeProps): React.JSX.Element {
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
