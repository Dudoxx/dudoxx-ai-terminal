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

/** Adapt the global fetch to the FetchLike surface the broker resolver needs. */
const globalFetch: FetchLike = async (input, init) => {
  const res = await fetch(input, init);
  return { ok: res.ok, status: res.status, json: () => res.json() };
};

/**
 * Build the resolver for this process. `DDX_TERM_BROKER_URL` set → broker-attached;
 * unset → standalone. `fetchImpl` is injectable for tests.
 */
export function buildResolver(env: NodeJS.ProcessEnv, tmux: TmuxClient, fetchImpl: FetchLike = globalFetch): RegistryResolver {
  const brokerUrl = env['DDX_TERM_BROKER_URL'];
  if (brokerUrl !== undefined && brokerUrl.length > 0) {
    return new BrokerRestResolver(brokerUrl.replace(/\/$/, ''), fetchImpl);
  }
  return new LocalMapResolver(tmux, new TerminalMap());
}
