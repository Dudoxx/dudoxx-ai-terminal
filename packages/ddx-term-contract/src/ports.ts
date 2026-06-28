/**
 * ports.ts — canonical port numbers, env-var names, and endpoint constants.
 *
 * Single source of truth for every process in the ddx-terminal-bridge stack that
 * needs to locate another process.  Consumers import constants (zero-cost) or call
 * resolvePorts() to honour env overrides at runtime.
 *
 * Pure constants + one pure helper — no I/O, no node built-ins, no zod needed.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

// ── canonical defaults ─────────────────────────────────────────────────────
//
// Ports live in the high 133XX band on purpose: it is well clear of the common
// dev-server ranges (3000/3001 Next, 5173 Vite, 6379 Redis, 8080) so the stack
// does not collide with the user's own running codebases. Both are overridable
// via the env vars below (set directly by the MCP client, or via a `.env` file —
// see ddx-term-mcp `loadDotenv()`).

/** HTTP/WS port for ddx-term-broker (NestJS). */
export const DEFAULT_BROKER_PORT = 13330 as const;

/** HTTP port for ddx-term-web (Next.js). */
export const DEFAULT_WEB_PORT = 13340 as const;

/** tmux control-mode socket path shared across all processes. */
export const DEFAULT_SOCKET = '/tmp/ddx-term.sock' as const;

/** Loopback host — broker binds here by design (auth posture v1). */
export const LOOPBACK_HOST = '127.0.0.1' as const;

/** Health endpoint path on the broker (used by the MCP supervisor probe). */
export const BROKER_HEALTH_PATH = '/api/v1/session/health' as const;

// ── env-var name constants ─────────────────────────────────────────────────

/** Env var that overrides the broker port (Number-parseable). */
export const ENV_BROKER_PORT = 'DDX_TERM_BROKER_PORT' as const;

/** Env var that overrides the web port (Number-parseable). */
export const ENV_WEB_PORT = 'DDX_TERM_WEB_PORT' as const;

/** Env var that overrides the tmux socket path. */
export const ENV_SOCKET = 'DDX_TERM_SOCKET' as const;

/** Env var that overrides the bind/connect host. */
export const ENV_HOST = 'DDX_TERM_HOST' as const;

// ── resolved ports shape ───────────────────────────────────────────────────

/** The fully-resolved set of connection parameters after env overrides. */
export interface ResolvedPorts {
  brokerPort: number;
  webPort: number;
  socket: string;
  host: string;
}

// ── runtime resolver ───────────────────────────────────────────────────────

/**
 * Resolve runtime port/socket/host values from the given env map.
 *
 * Applies Number() parsing with safe fallback to defaults — a non-numeric env
 * value (NaN) is silently ignored and the default is used instead.
 *
 * @param env - process.env or any compatible string map; typically pass
 *   `process.env` at the call site.
 * @returns ResolvedPorts — all fields always present, no undefineds.
 */
export function resolvePorts(env: Record<string, string | undefined>): ResolvedPorts {
  const brokerRaw = Number(env[ENV_BROKER_PORT]);
  const webRaw = Number(env[ENV_WEB_PORT]);

  return {
    brokerPort: Number.isFinite(brokerRaw) && brokerRaw > 0 ? brokerRaw : DEFAULT_BROKER_PORT,
    webPort: Number.isFinite(webRaw) && webRaw > 0 ? webRaw : DEFAULT_WEB_PORT,
    socket: env[ENV_SOCKET] ?? DEFAULT_SOCKET,
    host: env[ENV_HOST] ?? LOOPBACK_HOST,
  };
}
