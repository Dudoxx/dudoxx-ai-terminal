/**
 * terminal/view/[terminalId]/edit/page.tsx — §10 entity `view` route, edit mode.
 *
 * Same TerminalWorkspace; `edit` mode is a hint the workspace can use to open
 * the rename affordance by default (the existing inline-rename UI in
 * TerminalSidePanel is reused rather than a separate form — Cardinal #20).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { TerminalWorkspace } from '@/components/term/TerminalWorkspace';

interface Props {
  params: Promise<{ locale: string; terminalId: string }>;
}

export default async function TerminalViewEditPage({ params }: Props): Promise<React.JSX.Element> {
  const { locale, terminalId } = await params;
  return <TerminalWorkspace terminalId={terminalId} mode="edit" locale={locale} />;
}
