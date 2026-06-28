/**
 * next.config.ts — DDX Terminal Web
 *
 * Minimal Next.js 16 config. The broker is on port 6481; web UI is 3460.
 * All broker REST calls are proxied through /api/v1/terminals/** so the
 * browser never reaches the broker directly (R4 proxy.ts seam — here we use
 * a next-rewrites approach since this is a CLI terminal UI, not the full
 * Dudoxx HMS shell with proxy.ts).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  /**
   * Proxy broker REST calls — browser never talks directly to port 6481.
   * WS upgrade (/term/*) is handled by the xterm-client via the
   * NEXT_PUBLIC_BROKER_WS_URL env var (ws://localhost:6481/term/:id in dev).
   */
  async rewrites() {
    // SERVER-SIDE ONLY — this URL is used by Next.js's rewrite engine on the
    // server; it is NEVER bundled into client JS. Class-C lint is a false
    // positive here. BROKER_BASE_URL must be set to the real service address
    // in staging/production env (e.g. http://ddx-term-broker:6481).
    const brokerBase =
      process.env['BROKER_BASE_URL'] ?? 'http://localhost:6481'; // server-only
    return [
      // Bare collection path (GET list / POST create).
      {
        source: '/api/v1/terminals',
        destination: `${brokerBase}/api/v1/terminals`,
      },
      // Sub-paths (/:id, /:id/snapshot, …).
      {
        source: '/api/v1/terminals/:path*',
        destination: `${brokerBase}/api/v1/terminals/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
