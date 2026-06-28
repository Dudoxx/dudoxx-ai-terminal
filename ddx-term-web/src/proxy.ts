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
  // Match all routes except Next.js internals and static files.
  matcher: ['/((?!_next|_vercel|.*\\..*).*)'],
};
