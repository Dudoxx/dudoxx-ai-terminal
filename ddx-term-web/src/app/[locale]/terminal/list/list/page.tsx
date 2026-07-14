/**
 * terminal/list/list/page.tsx — §10 entity `list` route, row presentation.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { TerminalListView } from '@/components/term/TerminalListView';

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function TerminalListListPage({ params }: Props): Promise<React.JSX.Element> {
  const { locale } = await params;
  return <TerminalListView mode="list" locale={locale} />;
}
