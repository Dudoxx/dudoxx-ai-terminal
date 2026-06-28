/**
 * TerminalSidePanel.tsx — collapsible left nav: session list + appearance controls.
 *
 * Design-system §5: side nav is part of the main layout, horizontally collapsible,
 * collapsed-state persisted (handled by the page via localStorage). This component
 * is presentational — it receives the terminal list + active id + handlers and
 * renders the session nav above the AppearanceControls. No data fetching here.
 *
 * All strings via t(); semantic @theme tokens only; lucide-react icons only.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { TerminalSquare, Plus, PanelLeftClose, PanelLeftOpen, Pencil, Trash2, Check, X } from 'lucide-react';
import type { TerminalDescriptor } from '@ddx/term-contract';

import { AppearanceControls } from './AppearanceControls';

export interface TerminalSidePanelProps {
  terminals: readonly TerminalDescriptor[];
  activeId: string | null;
  collapsed: boolean;
  loading: boolean;
  onSelect: (terminalId: string) => void;
  onCreate: () => void;
  onRename: (terminalId: string, title: string) => void;
  onKill: (terminalId: string) => void;
  onToggleCollapsed: () => void;
}

export function TerminalSidePanel(props: TerminalSidePanelProps): React.JSX.Element {
  const {
    terminals, activeId, collapsed, loading,
    onSelect, onCreate, onRename, onKill, onToggleCollapsed,
  } = props;
  const t = useTranslations('terminal');

  // ── Collapsed rail: just an expand affordance + new-terminal shortcut ────
  if (collapsed) {
    return (
      <aside
        aria-label={t('aria.sidePanel')}
        className="flex h-full w-12 shrink-0 flex-col items-center gap-1 bg-surface-muted py-2 shadow-elev-1"
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={t('sidePanel.expand')}
          className="grid size-9 place-items-center rounded text-muted-foreground hover:bg-tab-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PanelLeftOpen aria-hidden className="size-5" />
        </button>
        <button
          type="button"
          onClick={onCreate}
          aria-label={t('newTerminal')}
          className="grid size-9 place-items-center rounded text-muted-foreground hover:bg-tab-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus aria-hidden className="size-5" />
        </button>
      </aside>
    );
  }

  // ── Expanded panel ──────────────────────────────────────────────────────
  return (
    <aside
      aria-label={t('aria.sidePanel')}
      className="flex h-full w-64 shrink-0 flex-col bg-surface-muted shadow-elev-1"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <h2 className="text-sm font-semibold text-foreground">{t('sidePanel.sessions')}</h2>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={t('sidePanel.collapse')}
          className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-tab-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PanelLeftClose aria-hidden className="size-4" />
        </button>
      </div>

      {/* Session list — the only scroll surface in the panel */}
      <nav
        aria-label={t('aria.sessionList')}
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2"
      >
        {loading ? (
          <span className="px-2 py-1.5 text-sm text-muted-foreground">{t('connecting')}</span>
        ) : terminals.length === 0 ? (
          <span className="px-2 py-1.5 text-sm text-muted-foreground">{t('noTerminals')}</span>
        ) : (
          terminals.map((descriptor) => (
            <TerminalRow
              key={descriptor.terminalId}
              descriptor={descriptor}
              active={descriptor.terminalId === activeId}
              onSelect={onSelect}
              onRename={onRename}
              onKill={onKill}
            />
          ))
        )}
      </nav>

      {/* New terminal */}
      <div className="px-2 py-2">
        <button
          type="button"
          onClick={onCreate}
          className="flex w-full items-center justify-center gap-1.5 rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus aria-hidden className="size-4" />
          {t('newTerminal')}
        </button>
      </div>

      {/* Appearance controls — pinned below the session list */}
      <div className="shadow-elev-1">
        <AppearanceControls />
      </div>
    </aside>
  );
}

// ── TerminalRow ───────────────────────────────────────────────────────────────

interface TerminalRowProps {
  descriptor: TerminalDescriptor;
  active: boolean;
  onSelect: (terminalId: string) => void;
  onRename: (terminalId: string, title: string) => void;
  onKill: (terminalId: string) => void;
}

/**
 * One session-list row. Three modes:
 *   - view:    label + hover-revealed rename (Pencil) / kill (Trash2) actions.
 *   - rename:  inline text input + confirm (Check) / cancel (X). Enter=confirm,
 *              Escape=cancel. Empty/unchanged title cancels (no no-op PATCH).
 *   - confirm: kill is two-step (Trash2 → Check/X) so there is NO destructive
 *              one-click and NO banned window.confirm() dialog (design-system §6/§7).
 */
function TerminalRow(props: TerminalRowProps): React.JSX.Element {
  const { descriptor, active, onSelect, onRename, onKill } = props;
  const t = useTranslations('terminal');
  const [mode, setMode] = useState<'view' | 'rename' | 'confirmKill'>('view');
  const [draft, setDraft] = useState(descriptor.title);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (mode === 'rename') inputRef.current?.select();
  }, [mode]);

  const commitRename = useCallback(() => {
    const next = draft.trim();
    if (next && next !== descriptor.title) onRename(descriptor.terminalId, next);
    setMode('view');
  }, [draft, descriptor.terminalId, descriptor.title, onRename]);

  const cancel = useCallback(() => {
    setDraft(descriptor.title);
    setMode('view');
  }, [descriptor.title]);

  // ── Rename mode: inline input ──────────────────────────────────────────
  if (mode === 'rename') {
    return (
      <div className="flex items-center gap-1 rounded bg-tab-active px-2 py-1">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          }}
          maxLength={64}
          aria-label={t('renameLabel', { title: descriptor.title })}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
        />
        <RowIconButton icon={Check} label={t('confirmRename')} onClick={commitRename} />
        <RowIconButton icon={X} label={t('cancel')} onClick={cancel} />
      </div>
    );
  }

  // ── View / confirmKill mode ────────────────────────────────────────────
  return (
    <div
      className={[
        'group flex items-center gap-1 rounded pl-2 pr-1 transition-colors',
        active ? 'bg-tab-active' : 'hover:bg-tab-hover',
      ].join(' ')}
    >
      <button
        type="button"
        aria-current={active ? 'true' : undefined}
        onClick={() => onSelect(descriptor.terminalId)}
        className={[
          'flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          active ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground',
        ].join(' ')}
      >
        <TerminalSquare aria-hidden className="size-4 shrink-0" />
        <span className="truncate">{t('tabLabel', { title: descriptor.title })}</span>
      </button>

      {mode === 'confirmKill' ? (
        <>
          <RowIconButton icon={Check} label={t('confirmKill')} danger onClick={() => onKill(descriptor.terminalId)} />
          <RowIconButton icon={X} label={t('cancel')} onClick={() => setMode('view')} />
        </>
      ) : (
        <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <RowIconButton icon={Pencil} label={t('rename')} onClick={() => { setDraft(descriptor.title); setMode('rename'); }} />
          <RowIconButton icon={Trash2} label={t('kill')} danger onClick={() => setMode('confirmKill')} />
        </div>
      )}
    </div>
  );
}

// ── RowIconButton ─────────────────────────────────────────────────────────────

interface RowIconButtonProps {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

/** Small square icon button used for the per-row rename/kill/confirm actions. */
function RowIconButton({ icon: Icon, label, onClick, danger }: RowIconButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={[
        'grid size-7 shrink-0 place-items-center rounded transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        danger
          ? 'text-muted-foreground hover:bg-danger/15 hover:text-danger'
          : 'text-muted-foreground hover:bg-tab-hover hover:text-foreground',
      ].join(' ')}
    >
      <Icon aria-hidden className="size-4" />
    </button>
  );
}
