/**
 * TerminalListView.tsx — §10 entity `list` route body (grid/list/timeline).
 *
 * Fetches the broker's terminal list once + polls (mirrors TerminalWorkspace's
 * own poll cadence so an agent-created terminal appears live here too), and
 * renders it in one of three presentations. Selection navigates via
 * router.push to view/{id} — never local state (AC1.3).
 *
 * All strings via t(); semantic @theme tokens only; lucide-react icons only.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TerminalSquare, Plus, LayoutGrid, List as ListIcon, Clock } from 'lucide-react';
import type { TerminalDescriptor } from '@ddx/term-contract';

import { TerminalBreadcrumb } from '@/components/term/TerminalBreadcrumb';

async function fetchTerminals(): Promise<TerminalDescriptor[]> {
  const res = await fetch('/api/v1/terminals');
  if (!res.ok) throw new Error(`GET /terminals failed: ${res.status}`);
  return res.json() as Promise<TerminalDescriptor[]>;
}

export type ListViewMode = 'grid' | 'list' | 'timeline';

export interface TerminalListViewProps {
  mode: ListViewMode;
  locale: string;
}

const VIEW_TABS: readonly { mode: ListViewMode; icon: typeof LayoutGrid; labelKey: string }[] = [
  { mode: 'grid', icon: LayoutGrid, labelKey: 'list.grid' },
  { mode: 'list', icon: ListIcon, labelKey: 'list.list' },
  { mode: 'timeline', icon: Clock, labelKey: 'list.timeline' },
] as const;

export function TerminalListView({ mode, locale }: TerminalListViewProps): React.JSX.Element {
  const t = useTranslations('terminal');
  const router = useRouter();
  const [terminals, setTerminals] = useState<TerminalDescriptor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      fetchTerminals()
        .then((list) => { if (!cancelled) setTerminals(list); })
        .catch(console.error)
        .finally(() => { if (!cancelled) setLoading(false); });

    void refresh();
    const poll = setInterval(() => void refresh(), 2000);
    return () => { cancelled = true; clearInterval(poll); };
  }, []);

  const goToView = (id: string) => router.push(`/${locale}/terminal/view/${id}`);
  const goToNew = () => router.push(`/${locale}/terminal/new`);

  // Timeline sorts most-recently-created first, using the descriptor's own
  // createdAt (epoch ms, set when the broker allocates the tmux window).
  const ordered = mode === 'timeline'
    ? [...terminals].sort((a, b) => b.createdAt - a.createdAt)
    : terminals;

  return (
    <main className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
      <header className="flex flex-col gap-3 px-4 py-3 shadow-elev-1">
        <TerminalBreadcrumb locale={locale} segments={[{ labelKey: 'breadcrumb.list' }]} />
        <div className="flex items-center justify-between">
          <h1 className="font-display text-lg font-semibold">{t('pageTitle')}</h1>
          <div className="flex items-center gap-2">
            <nav aria-label={t('list.viewModeNav')} className="flex items-center gap-1 rounded bg-surface-muted p-1">
              {VIEW_TABS.map(({ mode: tabMode, icon: Icon, labelKey }) => (
                <button
                  key={tabMode}
                  type="button"
                  aria-current={tabMode === mode ? 'true' : undefined}
                  onClick={() => router.push(`/${locale}/terminal/list/${tabMode}`)}
                  aria-label={t(labelKey as 'list.grid')}
                  className={[
                    'grid size-8 place-items-center rounded transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    tabMode === mode
                      ? 'bg-elevated text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  <Icon aria-hidden className="size-4" />
                </button>
              ))}
            </nav>
            <button
              type="button"
              onClick={goToNew}
              className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus aria-hidden className="size-4" />
              {t('newTerminal')}
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('connecting')}</p>
        ) : ordered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <TerminalSquare aria-hidden className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('noTerminals')}</p>
          </div>
        ) : mode === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {ordered.map((d) => (
              <button
                key={d.terminalId}
                type="button"
                onClick={() => goToView(d.terminalId)}
                className="flex flex-col items-start gap-2 rounded bg-surface p-3 text-left shadow-elev-2 hover:shadow-elev-3 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <TerminalSquare aria-hidden className="size-5 text-primary" />
                <span className="truncate text-sm font-medium">{d.title}</span>
                <span className="text-xs text-muted-foreground">{t('status.command', { command: d.command })}</span>
              </button>
            ))}
          </div>
        ) : mode === 'list' ? (
          <ul className="flex flex-col gap-1">
            {ordered.map((d) => (
              <li key={d.terminalId}>
                <button
                  type="button"
                  onClick={() => goToView(d.terminalId)}
                  className="flex w-full items-center gap-3 rounded bg-surface px-3 py-2 text-left shadow-elev-1 hover:shadow-elev-2 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <TerminalSquare aria-hidden className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{t('status.command', { command: d.command })}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ol className="flex flex-col gap-3 border-l-0 pl-0">
            {ordered.map((d) => (
              <li key={d.terminalId} className="flex items-center gap-3">
                <span aria-hidden className="size-2 shrink-0 rounded-full bg-link" />
                <button
                  type="button"
                  onClick={() => goToView(d.terminalId)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded bg-surface px-3 py-2 text-left shadow-elev-1 hover:shadow-elev-2 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="truncate text-sm font-medium">{d.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{t('status.command', { command: d.command })}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}
