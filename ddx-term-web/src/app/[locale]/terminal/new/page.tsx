/**
 * terminal/new/page.tsx — §10 entity `new` route.
 *
 * Creates a terminal via POST /api/v1/terminals as soon as the page mounts,
 * then navigates to its view route. There is no form here — a terminal has no
 * required creation fields beyond an auto-generated title (the same behavior
 * the old +New button had) — so `new` is a create-then-redirect route rather
 * than a form page. A brief loading state covers the round-trip.
 *
 * All strings via t(); semantic @theme tokens only. Zero `any`.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { TerminalDescriptor } from '@ddx/term-contract';

async function fetchTerminals(): Promise<TerminalDescriptor[]> {
  const res = await fetch('/api/v1/terminals');
  if (!res.ok) throw new Error(`GET /terminals failed: ${res.status}`);
  return res.json() as Promise<TerminalDescriptor[]>;
}

async function createTerminal(title: string): Promise<TerminalDescriptor> {
  const res = await fetch('/api/v1/terminals', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`POST /terminals failed: ${res.status}`);
  return res.json() as Promise<TerminalDescriptor>;
}

export default function TerminalNewPage(): React.JSX.Element {
  const t = useTranslations('terminal');
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const [error, setError] = useState(false);
  // Guards React 18/19 strict-mode double-invoke of the create effect —
  // without it, a dev double-mount would POST two terminals for one visit.
  const createdRef = useRef(false);

  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;

    void (async () => {
      try {
        const existing = await fetchTerminals();
        const title = t('newTerminalTitle', { n: existing.length + 1 });
        const descriptor = await createTerminal(title);
        router.replace(`/${params.locale}/terminal/view/${descriptor.terminalId}`);
      } catch (err) {
        console.error('Failed to create terminal:', err);
        setError(true);
      }
    })();
  }, [router, params.locale, t]);

  return (
    <main className="flex h-dvh min-h-0 items-center justify-center bg-background text-foreground">
      <p className="text-sm text-muted-foreground">
        {error ? t('createError') : t('creating')}
      </p>
    </main>
  );
}
