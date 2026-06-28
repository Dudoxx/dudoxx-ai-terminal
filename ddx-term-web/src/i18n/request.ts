/**
 * src/i18n/request.ts — next-intl per-request i18n config.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as 'en' | 'de' | 'fr')) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (
      await import(`../../messages/${locale}.json`)
    ).default as Record<string, unknown>,
    onError(error) {
      // Log missing keys in dev; swallow in prod to avoid crashing the render.
      if (process.env['NODE_ENV'] !== 'production') {
        console.error('[next-intl]', error);
      }
    },
    getMessageFallback({ namespace, key, error }) {
      const path = [namespace, key].filter(Boolean).join('.');
      if (process.env['NODE_ENV'] !== 'production') {
        console.warn(`[next-intl] Missing key: ${path}`, error?.message);
      }
      return path;
    },
  };
});
