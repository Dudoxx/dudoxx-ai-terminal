/**
 * health.ts — broker health probe for the supervisor.
 *
 * `probeHealth` fetches GET /api/v1/session/health and validates the response
 * body against BrokerHealthSchema.  A successful parse with
 * service==='ddx-term-broker' proves the responder is the real broker (FM#2
 * anti-zombie discriminator) — bare TCP connectivity is NOT sufficient.
 *
 * `probeForeign` detects a foreign process occupying the broker port and
 * throws PORT_CONFLICT so the supervisor never silently attaches to an
 * unrelated service.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { BROKER_HEALTH_PATH, BrokerHealthSchema, LOOPBACK_HOST } from '@ddx/term-contract';

import { TermError } from '../errors.js';

/** Milliseconds before a health fetch is aborted. */
const HEALTH_TIMEOUT_MS = 3_000;

/** Injected fetch surface (mirrors the FetchLike pattern in resolver-factory). */
export interface HealthFetch {
  (url: string, signal: AbortSignal): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
}

/** Default fetch implementation with abort support. */
export const defaultHealthFetch: HealthFetch = async (url, signal) => {
  const res = await fetch(url, { signal });
  return { ok: res.ok, status: res.status, json: () => res.json() as Promise<unknown> };
};

/**
 * Probe the broker's health endpoint.
 *
 * @returns `true` when the broker is the real ddx-term-broker AND reports
 *   `healthy: true`.  Returns `false` when the port is unreachable or the
 *   broker is reachable but not yet healthy (still starting up).
 * @throws TermError('PORT_CONFLICT') when a foreign process is on the port
 *   (TCP reachable but body does not satisfy BrokerHealthSchema).
 */
export async function probeHealth(
  brokerPort: number,
  fetchImpl: HealthFetch = defaultHealthFetch,
): Promise<boolean> {
  const url = `http://${LOOPBACK_HOST}:${brokerPort}${BROKER_HEALTH_PATH}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const res = await fetchImpl(url, controller.signal);
    if (!res.ok) return false;

    const body = await res.json();
    const parsed = BrokerHealthSchema.safeParse(body);

    if (!parsed.success) {
      // Reachable but not us → foreign process on the port.
      throw new TermError(
        'PORT_CONFLICT',
        `Foreign process is occupying broker port ${brokerPort} ` +
          `(env DDX_TERM_BROKER_PORT=${brokerPort}): health body did not satisfy BrokerHealthSchema`,
      );
    }

    return parsed.data.healthy;
  } catch (err: unknown) {
    if (err instanceof TermError) throw err;
    // Connection refused, timeout, ECONNREFUSED → port is free or broker not up yet.
    if (isNetworkError(err) || isAbortError(err)) return false;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Assert that the broker port is occupied by the real ddx-term-broker.
 * Throws PORT_CONFLICT if any other service is listening there.
 *
 * Intended for pre-spawn validation: call this before spawning to distinguish
 * "port free" (safe to spawn) from "port taken by someone else" (hard error).
 */
export async function probeForeign(
  brokerPort: number,
  fetchImpl: HealthFetch = defaultHealthFetch,
): Promise<void> {
  // probeHealth already throws PORT_CONFLICT on a foreign body — reuse it.
  // It returns false when unreachable (port free) or not-yet-healthy (our broker
  // starting) — both are fine from a foreign-detection standpoint.
  await probeHealth(brokerPort, fetchImpl);
}

// ── helpers ─────────────────────────────────────────────────────────────────

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  return (
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    err.message.includes('fetch failed') ||
    err.message.includes('ECONNREFUSED')
  );
}
