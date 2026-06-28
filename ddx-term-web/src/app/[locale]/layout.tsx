/**
 * src/app/[locale]/layout.tsx — root layout for all locales.
 *
 * Minimal app shell: provides next-intl messages + a dark background.
 * This is a CLI/terminal UI — the full Dudoxx entity-route header/footer
 * machinery is intentionally NOT applied here (In-Session scope note).
 * Semantic OKLCH tokens used for chrome; no raw palette utilities.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import '../globals.css';

interface Props {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  // Validate locale — next-intl notFound() pattern.
  if (!routing.locales.includes(locale as 'en' | 'de' | 'fr')) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale} className="dark">
      <body className="bg-background text-foreground min-h-dvh flex flex-col">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
