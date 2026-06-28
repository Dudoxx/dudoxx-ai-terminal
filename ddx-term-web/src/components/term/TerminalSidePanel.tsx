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

import { useTranslations } from 'next-intl';
import { TerminalSquare, Plus, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { TerminalDescriptor } from '@ddx/term-contract';

import { AppearanceControls } from './AppearanceControls';

export interface TerminalSidePanelProps {
  terminals: readonly TerminalDescriptor[];
  activeId: string | null;
  collapsed: boolean;
  loading: boolean;
  onSelect: (terminalId: string) => void;
  onCreate: () => void;
  onToggleCollapsed: () => void;
}

export function TerminalSidePanel(props: TerminalSidePanelProps): React.JSX.Element {
  const {
    terminals, activeId, collapsed, loading,
    onSelect, onCreate, onToggleCollapsed,
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
          terminals.map((descriptor) => {
            const active = descriptor.terminalId === activeId;
            return (
              <button
                key={descriptor.terminalId}
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => onSelect(descriptor.terminalId)}
                className={[
                  'flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-tab-active text-foreground'
                    : 'text-muted-foreground hover:bg-tab-hover hover:text-foreground',
                ].join(' ')}
              >
                <TerminalSquare aria-hidden className="size-4 shrink-0" />
                <span className="truncate">{t('tabLabel', { title: descriptor.title })}</span>
              </button>
            );
          })
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
