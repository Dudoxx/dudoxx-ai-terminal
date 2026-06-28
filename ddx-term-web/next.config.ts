/**
 * next.config.ts — DDX Terminal Web
 *
 * Minimal Next.js 16 config. The broker is on port 13330; web UI is 13340.
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
   * Emit a self-contained node_modules-traced bundle so the supervisor can run
   * the web tier without a full pnpm install.  server.mjs is the real entry
   * (WS-upgrade proxy) — it must be copied alongside .next/standalone/ by the
   * bundling shard (bn1).  NOTE: .next/static is NOT inside standalone by
   * default and must be copied to .next/standalone/.next/static, or assets 404.
   */
  output: 'standalone',
  /**
   * Proxy broker REST calls — browser never talks directly to port 13330.
   * WS upgrade (/term/*) is handled by the xterm-client via the
   * NEXT_PUBLIC_BROKER_WS_URL env var (ws://localhost:13330/term/:id in dev).
   */
  async rewrites() {
    // SERVER-SIDE ONLY — this URL is used by Next.js's rewrite engine on the
    // server; it is NEVER bundled into client JS. Class-C lint is a false
    // positive here. BROKER_BASE_URL must be set to the real service address
    // in staging/production env (e.g. http://ddx-term-broker:13330).
    const brokerBase =
      process.env['BROKER_BASE_URL'] ?? 'http://localhost:13330'; // server-only
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
