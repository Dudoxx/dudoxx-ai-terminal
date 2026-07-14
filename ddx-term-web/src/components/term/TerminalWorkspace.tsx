/**
 * TerminalWorkspace.tsx — the terminal session view (§10 `view` route body).
 *
 * Extracted from the former single-state terminal/page.tsx: this component owns
 * the XtermClient lifecycle, side panel, and status bar, but derives its active
 * terminal from a PROP (the route's `terminalId` param) instead of a local
 * useState — selection is a navigation (router.push to /terminal/view/{id}),
 * never local state (web-audit CRITICAL, page.tsx:77/118-120 in the old shape).
 *
 * Tab switch = dispose() + new XtermClient() + restoreSnapshot(), re-triggered
 * by the `terminalId` prop changing (Next.js route param change), not by
 * setState (RESPONSIVENESS §2.8 — unchanged from the prior implementation).
 *
 * `mode` toggles the rename affordance: 'edit' shows an inline rename form in
 * the status bar; 'readonly' suppresses all mutation actions (rename/kill/new)
 * from the side panel, showing the session purely for viewing.
 *
 * All user-facing strings via t(). Semantic OKLCH tokens only. Zero `any`.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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

export type WorkspaceMode = 'view' | 'readonly' | 'edit';

export interface TerminalWorkspaceProps {
  /** Active terminalId — comes from the route param, never local state. */
  terminalId: string;
  /** view = full controls; readonly = no mutation actions; edit = rename form open. */
  mode: WorkspaceMode;
  locale: string;
}

// ── Component ───────────────────────────────────────────────────────────────

export function TerminalWorkspace({ terminalId, mode, locale }: TerminalWorkspaceProps): React.JSX.Element {
  const t = useTranslations('terminal');
  const router = useRouter();
  const { appearance } = useTermAppearance();

  const [terminals, setTerminals] = useState<TerminalDescriptor[]>([]);
  const [connState, setConnState] = useState<ConnectionState>('disconnected');
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [notFound, setNotFound] = useState(false);

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

  // ── Navigate selection (router.push, NOT setState — AC1.3) ─────────────
  const navigateTo = useCallback((id: string) => {
    router.push(`/${locale}/terminal/view/${id}`);
  }, [router, locale]);

  // ── Load terminal list on mount + poll ──────────────────────────────────
  // Refresh the tab list: initial load + poll, so terminals created out-of-band
  // by the AGENT (via the MCP) appear in the human's session list without a
  // reload. The active terminal's xterm/WS is untouched — we only reconcile.
  // Once the poll confirms `terminalId` no longer exists, flip notFound —
  // covers the "URL points at a terminal the agent/user already killed" case.
  useEffect(() => {
    let cancelled = false;

    const refresh = (initial: boolean) =>
      fetchTerminals()
        .then((list) => {
          if (cancelled) return;
          setTerminals(list);
          if (!initial && !list.some((term) => term.terminalId === terminalId)) {
            setNotFound(true);
          }
        })
        .catch(console.error)
        .finally(() => {
          if (initial && !cancelled) setLoading(false);
        });

    void refresh(true);
    const poll = setInterval(() => void refresh(false), 2000);
    return () => { cancelled = true; clearInterval(poll); };
  }, [terminalId]);

  // ── Switch active terminal (re-triggered by terminalId prop change) ────
  const switchTo = useCallback(async (id: string, el: HTMLDivElement) => {
    clientRef.current?.dispose();
    clientRef.current = null;
    el.innerHTML = '';

    const tId = toTerminalId(id);
    const callbacks: XtermClientCallbacks = {
      onStateChange: (state) => setConnState(state),
      onData: () => { /* keystrokes handled internally by xterm */ },
      onReconnect: () => fetchSnapshot(id),
      // Shell exited (e.g. `exit`): the broker sent window-close for this tab's
      // window. Route to a neighbor so the UI never shows a dead terminal.
      onExit: () => void navigateToNeighbor(id),
    };

    // Construct with the CURRENT appearance so the first paint already matches
    // the user's persisted font/theme — no flash of default styling.
    const client = new XtermClient(tId, el, callbacks, appearanceRef.current);
    clientRef.current = client;

    await client.connect();
    const snapshot = await fetchSnapshot(id);
    client.restoreSnapshot(snapshot);
    // Deps intentionally empty: `id`/`el` are call-site args (not closed-over
    // state), and appearanceRef/navigateToNeighbor are read via stable refs —
    // this callback must NOT change identity on every render (it's re-invoked
    // imperatively by the terminalId effect below, not via a dep array).
  }, []);

  // ── Select a neighbor when the active terminal disappears ──────────────
  const navigateToNeighbor = useCallback((deadId: string) => {
    setTerminals((prev) => {
      const idx = prev.findIndex((term) => term.terminalId === deadId);
      const next = prev.filter((term) => term.terminalId !== deadId);
      const neighbor = next[Math.min(idx, next.length - 1)];
      if (neighbor) {
        navigateTo(neighbor.terminalId);
      } else {
        router.push(`/${locale}/terminal/list/grid`);
      }
      return next;
    });
  }, [navigateTo, router, locale]);

  useEffect(() => {
    if (!containerRef.current || notFound) return;
    const el = containerRef.current;
    void switchTo(terminalId, el);
    return () => {
      clientRef.current?.dispose();
      clientRef.current = null;
    };
  }, [terminalId, switchTo, notFound]);

  // ── Apply appearance changes LIVE to the active terminal ────────────────
  // Separate from switchTo so a font/theme change re-styles in place instead of
  // reconnecting (which would drop scrollback + re-fetch the snapshot).
  useEffect(() => {
    clientRef.current?.applyAppearance(appearance);
  }, [appearance]);

  // ── Create new terminal ────────────────────────────────────────────────
  const handleNew = useCallback(async () => {
    try {
      const title = t('newTerminalTitle', { n: terminals.length + 1 });
      const descriptor = await createTerminal(title);
      setTerminals((prev) => [...prev, descriptor]);
      navigateTo(descriptor.terminalId);
    } catch (err) {
      console.error('Failed to create terminal:', err);
    }
  }, [t, terminals.length, navigateTo]);

  // ── Kill a terminal (DELETE) ────────────────────────────────────────────
  const handleKill = useCallback(async (id: string) => {
    // Optimistically drop it; the DELETE is idempotent broker-side. On failure
    // the 2s poll re-adds it, so a transient error self-heals.
    if (id === terminalId) navigateToNeighbor(id);
    else setTerminals((prev) => prev.filter((term) => term.terminalId !== id));
    try {
      await destroyTerminal(id);
    } catch (err) {
      console.error('Failed to kill terminal:', err);
    }
  }, [terminalId, navigateToNeighbor]);

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
    if (mode === 'readonly') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === 'k') {
        e.preventDefault();
        clientRef.current?.clear();
      } else if (key === 'n') {
        e.preventDefault();
        void handleNew();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleNew, mode]);

  const activeDescriptor = terminals.find((term) => term.terminalId === terminalId);

  // ── Not-found: URL points at a terminal that no longer exists (AC1.7) ──
  if (notFound) {
    return (
      <main className="flex h-dvh min-h-0 items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">{t('notFound')}</p>
          <button
            type="button"
            onClick={() => router.push(`/${locale}/terminal/list/grid`)}
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('backToList')}
          </button>
        </div>
      </main>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <main className="flex h-dvh min-h-0 bg-background text-foreground">

      {/* ── Left side panel: session nav + appearance ─────────────────── */}
      <TerminalSidePanel
        terminals={terminals}
        activeId={terminalId}
        collapsed={collapsed}
        loading={loading}
        readonly={mode === 'readonly'}
        autoRename={mode === 'edit'}
        onSelect={navigateTo}
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
