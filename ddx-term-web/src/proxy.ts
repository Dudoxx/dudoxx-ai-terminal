/**
 * src/proxy.ts — Next.js 16 locale routing proxy (was middleware.ts in Next 15).
 *
 * Handles locale prefix routing for next-intl. No auth logic here — this is a
 * CLI terminal UI, not the full HMS shell.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Match all routes except Next.js internals, static files, AND /api (broker
  // proxy paths must NOT be locale-prefixed — prefixing /api/v1/terminals →
  // /en/api/v1/terminals breaks the rewrite and 404s the broker call).
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
