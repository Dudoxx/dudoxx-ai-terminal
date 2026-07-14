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
import { Bricolage_Grotesque } from 'next/font/google';
import { routing } from '@/i18n/routing';
import '../globals.css';

// Display face (Toucan Signal three-face type stack: Bricolage display +
// Inter UI + JetBrains Mono data). Self-hosted via next/font/google — avoids
// a raw <link> tag's layout shift + CSP exposure. Exposed as --font-bricolage,
// consumed by globals.css's --font-display.
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
});

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
    <html lang={locale} className={`dark ${bricolage.variable}`}>
      <body className="bg-background text-foreground min-h-dvh flex flex-col">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
