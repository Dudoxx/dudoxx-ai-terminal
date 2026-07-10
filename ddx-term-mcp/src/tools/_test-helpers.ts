/**
 * _test-helpers.ts — shared mock ToolContext for the per-verb unit specs.
 *
 * Builds a ToolContext whose TmuxClient + resolver are vitest mocks so each verb
 * test asserts the exact tmux calls without a real tmux server. NOT a *.spec.ts
 * (no tests of its own); imported by the verb specs.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { vi, type Mock } from 'vitest';

import { toTerminalId, type TermListEntry } from '@ddx/term-contract';

import { AllowList } from '../allow-list.js';
import { ReadCursor } from '../read-cursor.js';
import type { TermConfig, ToolContext } from '../context.js';
import type { RegistryResolver, ResolvedTerminal } from '../registry-resolver.js';
import type { TmuxClient } from '../tmux/tmux.client.js';

/** A TmuxClient whose every method is a vitest mock. */
export type MockTmux = { [K in keyof TmuxClient]: Mock };

export function makeTmux(overrides: Partial<Record<keyof TmuxClient, unknown>> = {}): MockTmux {
  const base: Record<string, Mock> = {
    hasSession: vi.fn(async () => true),
    newSession: vi.fn(async () => undefined),
    killServer: vi.fn(async () => undefined),
    newWindow: vi.fn(async () => ({ windowId: '@1', panePid: 100, cwd: '/tmp' })),
    killWindow: vi.fn(async () => undefined),
    listWindows: vi.fn(async () => []),
    sendKeysLiteral: vi.fn(async () => undefined),
    sendKey: vi.fn(async () => undefined),
    capturePaneVisible: vi.fn(async () => ''),
    capturePaneScrollback: vi.fn(async () => ''),
    panePid: vi.fn(async () => 100),
    paneDimensions: vi.fn(async () => ({ cols: 120, lines: 30 })),
    listPanes: vi.fn(async () => []),
    childPids: vi.fn(async () => []),
    descendantPids: vi.fn(async () => []),
    psRows: vi.fn(async () => []),
    killPid: vi.fn(async () => undefined),
  };
  for (const [k, v] of Object.entries(overrides)) {
    base[k] = vi.fn(v as () => unknown);
  }
  return base as unknown as MockTmux;
}

/** A resolver that resolves any terminalId to a fixed window, with mocks. */
export function makeResolver(
  resolved: ResolvedTerminal = { terminalId: toTerminalId('t01'), windowId: '@1', panePid: 100 },
  rows: TermListEntry[] = [],
): RegistryResolver & { resolve: Mock; create: Mock; release: Mock; list: Mock; count: Mock } {
  return {
    resolve: vi.fn(async () => resolved),
    create: vi.fn(async () => ({ resolved, cwd: '/tmp', created: true })),
    release: vi.fn(async () => undefined),
    list: vi.fn(async () => rows),
    count: vi.fn(async () => rows.length),
  };
}

export function makeConfig(overrides: Partial<TermConfig> = {}): TermConfig {
  return {
    socket: '/tmp/test.sock',
    session: 'ddx-test',
    defaultTerminal: toTerminalId('t01'),
    allowlistPath: undefined,
    maxReadLines: 2000,
    maxTerminals: 10,
    ...overrides,
  };
}

/**
 * The context a verb receives, narrowed so tests can read the mock call records.
 * `tmux`/`resolver` are the mock surfaces; the rest is the real ToolContext.
 */
export interface MockContext extends Omit<ToolContext, 'tmux' | 'resolver'> {
  readonly tmux: MockTmux;
  readonly resolver: ReturnType<typeof makeResolver>;
}

export function makeContext(opts: {
  tmux?: MockTmux;
  resolver?: ReturnType<typeof makeResolver>;
  config?: Partial<TermConfig>;
  allowList?: AllowList;
} = {}): MockContext {
  const tmux = opts.tmux ?? makeTmux();
  const resolver = opts.resolver ?? makeResolver();
  return {
    tmux,
    resolver,
    cursor: new ReadCursor(),
    allowList: opts.allowList ?? AllowList.fromPath(undefined),
    config: makeConfig(opts.config),
  };
}

/** Pass a MockContext where a real ToolContext is expected (verbs only call the mocked methods). */
export function asContext(ctx: MockContext): ToolContext {
  return ctx as unknown as ToolContext;
}
