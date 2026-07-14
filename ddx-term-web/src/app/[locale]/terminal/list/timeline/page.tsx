/**
 * terminal/list/timeline/page.tsx — §10 entity `list` route, activity/timeline presentation.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { TerminalListView } from '@/components/term/TerminalListView';

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function TerminalListTimelinePage({ params }: Props): Promise<React.JSX.Element> {
  const { locale } = await params;
  return <TerminalListView mode="timeline" locale={locale} />;
}
