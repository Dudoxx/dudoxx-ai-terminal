/**
 * health.spec.ts — FM#2: probeHealth validates BrokerHealthSchema service
 * literal; foreign process on broker port → PORT_CONFLICT, never silent-attach.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { describe, expect, it } from 'vitest';

import { TermError } from '../errors.js';
import { type HealthFetch, probeHealth } from './health.js';

const BROKER_PORT = 13330;

/** Build a HealthFetch stub that returns a fixed response body. */
function stubFetch(body: unknown, ok = true, status = 200): HealthFetch {
  return async (_url, _signal) => ({
    ok,
    status,
    json: async () => body,
  });
}

/** Build a HealthFetch stub that rejects (simulates ECONNREFUSED). */
function unreachableFetch(): HealthFetch {
  return async (_url, _signal) => {
    const err = Object.assign(new Error('fetch failed: ECONNREFUSED'), { code: 'ECONNREFUSED' });
    throw err;
  };
}

/** Build a HealthFetch stub that rejects with AbortError (simulates timeout). */
function timeoutFetch(): HealthFetch {
  return async (_url, _signal) => {
    const err = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    throw err;
  };
}

/** A valid BrokerHealth body that satisfies BrokerHealthSchema. */
const VALID_BROKER_BODY = {
  service: 'ddx-term-broker',
  version: '1.0.0',
  healthy: true,
  sessionId: 'ddx-shared',
  socketPath: '/tmp/ddx-term.sock',
};

describe('probeHealth — real broker', () => {
  it('returns true when body is valid and healthy:true', async () => {
    const result = await probeHealth(BROKER_PORT, stubFetch(VALID_BROKER_BODY));
    expect(result).toBe(true);
  });

  it('returns false when healthy:false (broker starting)', async () => {
    const body = { ...VALID_BROKER_BODY, healthy: false };
    const result = await probeHealth(BROKER_PORT, stubFetch(body));
    expect(result).toBe(false);
  });

  it('returns false when HTTP status is not ok', async () => {
    const result = await probeHealth(BROKER_PORT, stubFetch(VALID_BROKER_BODY, false, 503));
    expect(result).toBe(false);
  });
});

describe('probeHealth — unreachable port', () => {
  it('returns false on ECONNREFUSED (port is free)', async () => {
    const result = await probeHealth(BROKER_PORT, unreachableFetch());
    expect(result).toBe(false);
  });

  it('returns false on AbortError (timeout)', async () => {
    const result = await probeHealth(BROKER_PORT, timeoutFetch());
    expect(result).toBe(false);
  });
});

describe('probeHealth — FM#2: foreign process on port', () => {
  it('throws PORT_CONFLICT when body does not satisfy BrokerHealthSchema', async () => {
    // A foreign service responding with its own JSON body.
    const foreignBody = { status: 'ok', service: 'some-other-service' };
    await expect(probeHealth(BROKER_PORT, stubFetch(foreignBody))).rejects.toThrow(TermError);
  });

  it('PORT_CONFLICT error names the port and DDX_TERM_BROKER_PORT', async () => {
    const foreignBody = { status: 'ok', uptime: 12345 };
    try {
      await probeHealth(BROKER_PORT, stubFetch(foreignBody));
      expect.fail('expected PORT_CONFLICT to be thrown');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(TermError);
      const termErr = err as TermError;
      expect(termErr.code).toBe('PORT_CONFLICT');
      expect(termErr.message).toContain(String(BROKER_PORT));
      expect(termErr.retriable).toBe(false);
    }
  });

  it('does NOT silently attach when service literal is wrong', async () => {
    const wrongLiteral = { ...VALID_BROKER_BODY, service: 'nginx' };
    await expect(probeHealth(BROKER_PORT, stubFetch(wrongLiteral))).rejects.toSatisfy(
      (e: unknown) => e instanceof TermError && (e as TermError).code === 'PORT_CONFLICT',
    );
  });

  it('does NOT silently attach when body is empty object', async () => {
    await expect(probeHealth(BROKER_PORT, stubFetch({}))).rejects.toSatisfy(
      (e: unknown) => e instanceof TermError && (e as TermError).code === 'PORT_CONFLICT',
    );
  });
});
