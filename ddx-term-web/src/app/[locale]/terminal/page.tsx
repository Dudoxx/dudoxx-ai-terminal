/**
 * terminal/page.tsx — §10 entity index route.
 *
 * The former single-state terminal page (activeId in useState) is replaced by
 * the view/[terminalId] + list/{grid,list,timeline} route family (web-audit
 * CRITICAL — page.tsx:77,118-120 in the old shape). This index redirects to
 * the most-recently-created terminal's view route when one exists, else to
 * list/grid, which itself renders the empty-state when there are none.
 *
 * Server component — the redirect target is resolved with one broker fetch
 * before any client JS mounts, so a cold-load never flashes an intermediate
 * "which terminal?" state.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { redirect } from 'next/navigation';
import type { TerminalDescriptor } from '@ddx/term-contract';

interface Props {
  params: Promise<{ locale: string }>;
}

async function fetchMostRecentTerminal(): Promise<TerminalDescriptor | null> {
  try {
    // A server component's fetch() is Node-side and does NOT go through
    // next.config.ts's rewrites() (that only proxies client→Next HTTP
    // requests) — so this hits the broker directly, using the SAME
    // BROKER_BASE_URL env var the rewrite config resolves, per next.config.ts.
    const brokerBase = process.env['BROKER_BASE_URL'] ?? 'http://localhost:13330';
    const res = await fetch(`${brokerBase}/api/v1/terminals`, { cache: 'no-store' });
    if (!res.ok) return null;
    const list = await res.json() as TerminalDescriptor[];
    if (list.length === 0) return null;
    // Most-recently-created first, using the descriptor's own createdAt —
    // same field TerminalListView's timeline mode sorts by.
    return [...list].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
  } catch {
    return null;
  }
}

export default async function TerminalIndexPage({ params }: Props): Promise<never> {
  const { locale } = await params;
  const mostRecent = await fetchMostRecentTerminal();
  if (mostRecent) {
    redirect(`/${locale}/terminal/view/${mostRecent.terminalId}`);
  }
  redirect(`/${locale}/terminal/list/grid`);
}
