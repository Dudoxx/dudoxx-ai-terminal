/**
 * src/app/page.tsx — root redirect to the negotiated locale's /terminal.
 *
 * Next.js 16 needs a root page.tsx when [locale] is the first segment. This
 * route sits OUTSIDE proxy.ts's matcher (config.matcher excludes the exact
 * root already being unprefixed), so it must negotiate the locale itself
 * rather than hardcode '/en' (web-audit HIGH — page.tsx:12 in the old shape).
 * Uses next-intl's own negotiation (Accept-Language via getRequestConfig,
 * same source proxy.ts's middleware uses for prefixed routes) so a French or
 * German browser lands on /fr/terminal or /de/terminal, not always /en.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';

export default async function RootPage(): Promise<never> {
  const locale = await getLocale();
  redirect(`/${locale}/terminal`);
}
