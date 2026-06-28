/**
 * src/app/page.tsx — root redirect to /en/terminal.
 *
 * Next.js 16 needs a root page.tsx when [locale] is the first segment.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { redirect } from 'next/navigation';

export default function RootPage(): never {
  redirect('/en/terminal');
}
