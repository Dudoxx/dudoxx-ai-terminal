/**
 * resolver-factory.ts — pick the RegistryResolver impl from the environment.
 *
 * Registry-ownership (shard 06): when a broker URL is present we are
 * broker-attached and the broker REST registry is authoritative
 * (BrokerRestResolver). Otherwise we run standalone and the local slug↔window
 * map is authoritative (LocalMapResolver). The verbs never branch on this — both
 * satisfy RegistryResolver.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import {
  BrokerRestResolver,
  LocalMapResolver,
  type FetchLike,
  type RegistryResolver,
} from './registry-resolver.js';
import { TerminalMap } from './terminal-map.js';
import type { TmuxClient } from './tmux/tmux.client.js';

/**
 * Broker REST request timeout (ms). A bare `fetch` to a down/unreachable broker
 * hangs on the OS connect timeout (tens of seconds to minutes), which would hang
 * the MCP tool call indefinitely. We bound it so a broker outage surfaces as a
 * fast, clear error the agent can act on instead of a silent stall.
 */
const BROKER_FETCH_TIMEOUT_MS = Number(process.env['DDX_TERM_BROKER_TIMEOUT_MS'] ?? 5_000);

/** Adapt the global fetch to the FetchLike surface the broker resolver needs. */
const globalFetch: FetchLike = async (input, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BROKER_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    return { ok: res.ok, status: res.status, json: () => res.json() };
  } catch (err: unknown) {
    // Normalize an abort/connection failure into a clear, attributable error.
    const reason =
      err instanceof Error && err.name === 'AbortError'
        ? `broker did not respond within ${BROKER_FETCH_TIMEOUT_MS}ms`
        : err instanceof Error
          ? err.message
          : String(err);
    throw new Error(`broker request failed: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Build the resolver for this process. `DDX_TERM_BROKER_URL` set → broker-attached;
 * unset → standalone. `fetchImpl` is injectable for tests.
 */
export function buildResolver(env: NodeJS.ProcessEnv, tmux: TmuxClient, fetchImpl: FetchLike = globalFetch): RegistryResolver {
  const brokerUrl = env['DDX_TERM_BROKER_URL'];
  if (brokerUrl !== undefined && brokerUrl.length > 0) {
    // The broker mounts every REST route under a global `/api/v1` prefix
    // (ddx-term-broker main.ts: app.setGlobalPrefix('api/v1')). DDX_TERM_BROKER_URL
    // carries only the host:port, so we append the API base here — otherwise every
    // resolver call hits `/terminals` and gets a 404. Appending once at construction
    // means all four REST call sites inherit the prefix.
    const apiBase = `${brokerUrl.replace(/\/$/, '')}/api/v1`;
    return new BrokerRestResolver(apiBase, fetchImpl);
  }
  return new LocalMapResolver(tmux, new TerminalMap());
}
