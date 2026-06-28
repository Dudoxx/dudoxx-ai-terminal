/**
 * session.service.spec.ts
 *
 * Asserts SPIKE-critical invariants (_invariants.md, ARCHITECTURE §6):
 *   1. Session creation MUST pass `-f /dev/null` and use `new-session` with
 *      `-x 120 -y 30` (never inherits ~/.tmux.conf — SPIKE footgun #2).
 *   2. Pinning MUST use `set-option -g default-size 120x30` and MUST NEVER
 *      use `set-window-option -g window-size manual` (SPIKE footgun #1:
 *      kills tmux 3.6a on new-window in a detached clientless session).
 *   3. PID resolution: panePid (shell) and fgPid (foreground child) are
 *      distinct numbers; fgPid is null when no child is running.
 *   4. terminalId↔windowId binding is stable and resolvable.
 *
 * Strategy: replace execFileAsync at the module level by injecting a
 * controlled exec function via the ExecRunner injection token, so every
 * tmux call is captured without the CommonJS/promisify interception pitfall.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { Test } from '@nestjs/testing';
import { toTerminalId } from '@ddx/term-contract';
import { SessionService, EXEC_RUNNER, type ExecRunner } from './session.service';

/** Build an ExecRunner mock that records calls and returns configured outputs. */
function makeRunner(
  overrides: Record<string, { stdout?: string; error?: Error }> = {},
): { runner: ExecRunner; calls: Array<[string, string[]]> } {
  const calls: Array<[string, string[]]> = [];

  const runner: ExecRunner = async (file, args) => {
    calls.push([file, args]);
    const key = [file, ...args].join(' ');

    // Check overrides by substring match.
    for (const [pattern, result] of Object.entries(overrides)) {
      if (key.includes(pattern)) {
        if (result.error) throw result.error;
        return { stdout: result.stdout ?? '', stderr: '' };
      }
    }

    // Defaults: simulate a plausible tmux environment.
    if (key.includes('has-session')) {
      throw new Error('session not found');           // absent → create
    }
    if (key.includes('new-session')) return { stdout: '', stderr: '' };
    if (key.includes('set-option')) return { stdout: '', stderr: '' };
    if (key.includes('new-window')) return { stdout: '@1\n', stderr: '' };
    if (key.includes('rename-window')) return { stdout: '', stderr: '' };
    if (key.includes('pane_pid')) return { stdout: '12345\n', stderr: '' };
    if (key.includes('pane_current_path')) return { stdout: '/tmp\n', stderr: '' };
    if (key.includes('pane_current_command')) return { stdout: 'zsh\n', stderr: '' };
    if (key.includes('kill-window')) return { stdout: '', stderr: '' };
    if (file === 'pgrep') return { stdout: '12399\n', stderr: '' };

    return { stdout: '', stderr: '' };
  };

  return { runner, calls };
}

/** Build a NestJS testing module with the given ExecRunner. */
async function buildModule(runner: ExecRunner): Promise<SessionService> {
  const module = await Test.createTestingModule({
    providers: [
      SessionService,
      { provide: EXEC_RUNNER, useValue: runner },
    ],
  }).compile();
  return module.get(SessionService);
}

// ── ensureSession (SPIKE-critical boot) ──────────────────────────────────────

describe('SessionService › ensureSession (SPIKE-critical boot)', () => {
  it('passes -f /dev/null to the new-session call (never inherits ~/.tmux.conf)', async () => {
    const { runner, calls } = makeRunner();
    const svc = await buildModule(runner);
    await svc.onModuleInit();

    const newSessionCall = calls.find(([, args]) => args.includes('new-session'));
    expect(newSessionCall).toBeDefined();
    expect(newSessionCall![1]).toContain('-f');
    expect(newSessionCall![1]).toContain('/dev/null');
  });

  it('pins size with set-option -g default-size 120x30 after session creation', async () => {
    const { runner, calls } = makeRunner();
    const svc = await buildModule(runner);
    await svc.onModuleInit();

    const setPinCall = calls.find(
      ([, args]) => args.includes('set-option') && args.includes('default-size'),
    );
    expect(setPinCall).toBeDefined();
    expect(setPinCall![1]).toContain('120x30');
  });

  it('NEVER uses set-window-option window-size manual (tmux 3.6a crash)', async () => {
    const { runner, calls } = makeRunner();
    const svc = await buildModule(runner);
    await svc.onModuleInit();

    const forbidden = calls.some(
      ([, args]) =>
        args.includes('set-window-option') && args.includes('manual'),
    );
    expect(forbidden).toBe(false);
  });

  it('includes the session socket path (-S) in the new-session call', async () => {
    const { runner, calls } = makeRunner();
    const svc = await buildModule(runner);
    await svc.onModuleInit();

    const newSessionCall = calls.find(([, args]) => args.includes('new-session'));
    expect(newSessionCall).toBeDefined();
    expect(newSessionCall![1]).toContain('-S');
  });

  it('skips creation and reuses an existing session', async () => {
    const { runner, calls } = makeRunner({
      'has-session': { stdout: '' }, // no throw → session exists
    });
    const svc = await buildModule(runner);
    await svc.onModuleInit();

    const newSessionCall = calls.find(([, args]) => args.includes('new-session'));
    expect(newSessionCall).toBeUndefined();
  });
});

// ── PID resolution (FM#4 identity/snapshot separation) ───────────────────────

describe('SessionService › PID resolution (FM#4 identity↔snapshot separation)', () => {
  it('returns distinct panePid (shell) and fgPid (foreground child)', async () => {
    const { runner } = makeRunner({
      pane_pid: { stdout: '12345\n' },
      pgrep: { stdout: '12399\n' },
    });
    const svc = await buildModule(runner);
    await svc.onModuleInit();

    const descriptor = await svc.createTerminal('test-pid');
    expect(descriptor.panePid).toBe(12345);
    expect(descriptor.fgPid).toBe(12399);
    expect(descriptor.fgPid).not.toBe(descriptor.panePid);
  });

  it('sets fgPid to null when pgrep finds no children (shell at prompt)', async () => {
    const { runner } = makeRunner({
      pane_pid: { stdout: '55555\n' },
      pgrep: { error: new Error('no children') },
    });
    const svc = await buildModule(runner);
    await svc.onModuleInit();

    const descriptor = await svc.createTerminal('no-child');
    expect(descriptor.panePid).toBe(55555);
    expect(descriptor.fgPid).toBeNull();
  });

  it('panePid and fgPid are typed as number — never string, never undefined', async () => {
    const { runner } = makeRunner();
    const svc = await buildModule(runner);
    await svc.onModuleInit();

    const descriptor = await svc.createTerminal('type-check');
    expect(typeof descriptor.panePid).toBe('number');
    expect(
      descriptor.fgPid === null || typeof descriptor.fgPid === 'number',
    ).toBe(true);
  });
});

// ── Terminal registry (terminalId↔windowId durable binding) ──────────────────

describe('SessionService › terminal registry', () => {
  it('registers a new terminal with stable terminalId mapped to windowId', async () => {
    const { runner } = makeRunner({
      'new-window': { stdout: '@1\n' },
    });
    const svc = await buildModule(runner);
    await svc.onModuleInit();

    const descriptor = await svc.createTerminal('my-term');
    expect(descriptor.terminalId).toBe('my-term');
    expect(descriptor.windowId).toBe('@1');

    const resolved = svc.resolveWindowId(descriptor.terminalId);
    expect(resolved).toBe('@1');
  });

  it('lists all registered terminals', async () => {
    const { runner } = makeRunner();
    const svc = await buildModule(runner);
    await svc.onModuleInit();

    await svc.createTerminal('term-a');
    await svc.createTerminal('term-b');

    const list = svc.listTerminals();
    expect(list).toHaveLength(2);
  });

  it('destroyTerminal removes the entry from the registry', async () => {
    const { runner } = makeRunner();
    const svc = await buildModule(runner);
    await svc.onModuleInit();

    const descriptor = await svc.createTerminal('ephemeral');
    expect(svc.listTerminals()).toHaveLength(1);

    await svc.destroyTerminal(descriptor.terminalId);
    expect(svc.listTerminals()).toHaveLength(0);
  });

  it('throws when destroying an unregistered terminalId', async () => {
    const { runner } = makeRunner();
    const svc = await buildModule(runner);
    await svc.onModuleInit();

    await expect(
      svc.destroyTerminal(toTerminalId('nonexistent')),
    ).rejects.toThrow('Terminal not found');
  });

  it('destroyTerminal is idempotent — a missing tmux window still evicts (0.C)', async () => {
    // kill-window throws "can't find window" (already gone), but the registry
    // entry MUST still be evicted and the call MUST resolve — no orphan left.
    const { runner } = makeRunner({
      'kill-window': { error: new Error("can't find window: @1") },
    });
    const svc = await buildModule(runner);
    await svc.onModuleInit();

    const descriptor = await svc.createTerminal('zombie');
    expect(svc.listTerminals()).toHaveLength(1);

    await expect(svc.destroyTerminal(descriptor.terminalId)).resolves.toBeUndefined();
    expect(svc.listTerminals()).toHaveLength(0);
    expect(svc.resolveWindowId(descriptor.terminalId)).toBeUndefined();
  });
});

// ── Boot reconcile (0.D registry↔tmux drift) ─────────────────────────────────

describe('SessionService › boot reconcile (0.D registry↔tmux drift)', () => {
  it('adopts surviving tmux windows into the registry on boot', async () => {
    // Reused session with two live windows the (empty) registry never saw —
    // a broker restart. reconcileRegistry must adopt both so term_list works.
    const { runner } = makeRunner({
      'has-session': { stdout: '' }, // session already exists → reused
      'list-windows': { stdout: '@0 human\n@1 build\n' },
      pane_pid: { stdout: '4242\n' },
    });
    const svc = await buildModule(runner);
    await svc.onModuleInit();

    const list = svc.listTerminals();
    expect(list).toHaveLength(2);
    const windowIds = list.map((d) => d.windowId).sort();
    expect(windowIds).toEqual(['@0', '@1']);
    // The window NAME becomes the terminalId slug.
    expect(svc.resolveWindowId(toTerminalId('build'))).toBe('@1');
    expect(svc.resolveWindowId(toTerminalId('human'))).toBe('@0');
  });

  it('drops registry entries whose tmux window no longer exists', async () => {
    // Boot with a fresh session (no live windows reported), then a created
    // terminal whose window tmux later reports as gone is reconciled away.
    let windowsOut = '@1 alive\n';
    const runner: ExecRunner = async (file, args) => {
      const key = [file, ...args].join(' ');
      if (key.includes('has-session')) return { stdout: '', stderr: '' }; // reused
      if (key.includes('list-windows')) return { stdout: windowsOut, stderr: '' };
      if (key.includes('list-panes')) return { stdout: '', stderr: '' };
      if (key.includes('new-window')) return { stdout: '@2\n', stderr: '' };
      if (key.includes('rename-window')) return { stdout: '', stderr: '' };
      if (key.includes('pane_id')) return { stdout: '%2\n', stderr: '' };
      if (key.includes('pane_pid')) return { stdout: '777\n', stderr: '' };
      if (key.includes('pane_current_path')) return { stdout: '/tmp\n', stderr: '' };
      if (key.includes('pane_current_command')) return { stdout: 'zsh\n', stderr: '' };
      if (file === 'pgrep') return { stdout: '', stderr: '' };
      return { stdout: '', stderr: '' };
    };
    const svc = await buildModule(runner);
    await svc.onModuleInit(); // adopts @1 (alive)

    // Create @2; then tmux reports only @1 — @2 is gone.
    await svc.createTerminal('doomed'); // → @2
    expect(svc.listTerminals().length).toBeGreaterThanOrEqual(2);

    // Re-run reconcile via a second onModuleInit (list still only @1).
    windowsOut = '@1 alive\n';
    await svc.onModuleInit();

    const remaining = svc.listTerminals();
    expect(remaining.map((d) => d.windowId)).not.toContain('@2');
    expect(remaining.map((d) => d.windowId)).toContain('@1');
  });
});
