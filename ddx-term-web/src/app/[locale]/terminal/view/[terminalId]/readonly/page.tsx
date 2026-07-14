/**
 * terminal/view/[terminalId]/readonly/page.tsx — §10 entity `view` route, readonly mode.
 *
 * Same TerminalWorkspace, `readonly` mode: side panel hides new/rename/kill
 * mutation affordances. The xterm view itself still accepts input (this mode
 * hides SESSION-MANAGEMENT actions, not terminal I/O — there is no concept of
 * a read-only shell at the tmux layer).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { TerminalWorkspace } from '@/components/term/TerminalWorkspace';

interface Props {
  params: Promise<{ locale: string; terminalId: string }>;
}

export default async function TerminalViewReadonlyPage({ params }: Props): Promise<React.JSX.Element> {
  const { locale, terminalId } = await params;
  return <TerminalWorkspace terminalId={terminalId} mode="readonly" locale={locale} />;
}
