/**
 * terminal/view/[terminalId]/page.tsx — §10 entity `view` route.
 *
 * Thin server shell: derives the active terminalId from the Next.js 16 async
 * route param (NOT client useState — web-audit CRITICAL) and mounts the
 * TerminalWorkspace client component in full `view` mode (all controls).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { TerminalWorkspace } from '@/components/term/TerminalWorkspace';

interface Props {
  params: Promise<{ locale: string; terminalId: string }>;
}

export default async function TerminalViewPage({ params }: Props): Promise<React.JSX.Element> {
  const { locale, terminalId } = await params;
  return <TerminalWorkspace terminalId={terminalId} mode="view" locale={locale} />;
}
