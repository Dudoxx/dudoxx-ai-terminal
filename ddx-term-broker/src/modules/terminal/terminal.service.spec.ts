/**
 * terminal.service.spec.ts
 *
 * Asserts the broker's terminal CRUD contract (shard 06):
 *   - POST /terminals allocates a new tmux window with a stable terminalId
 *     and writes it to the broker-owned registry.
 *   - GET  /terminals/:id resolves panePid (shell) and fgPid (child) as
 *     distinct SNAPSHOT numbers (FM#4).
 *   - DELETE /terminals/:id frees the registry entry.
 *   - terminalId and windowId are never the same value (identity separation).
 *
 * SessionService is replaced by a lightweight stub so no real tmux is needed.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TerminalService } from './terminal.service';
import { SessionService } from '../session/session.service';
import { EXEC_RUNNER } from '../session/session.service';
import {
  toTerminalId,
  type TerminalDescriptor,
  type TerminalId,
  type WindowId,
  DEFAULT_RESIZE_POLICY,
  DEFAULT_INPUT_ARBITRATION,
} from '@ddx/term-contract';

// ── Minimal SessionService stub ──────────────────────────────────────────────

function makeDescriptor(
  terminalId: TerminalId,
  windowId: WindowId,
  panePid: number,
  fgPid: number | null,
): TerminalDescriptor {
  return {
    terminalId,
    windowId,
    title: terminalId,
    panePid,
    fgPid,
    cwd: '/tmp',
    command: 'zsh',
    createdAt: Date.now(),
  };
}

class StubSessionService {
  private registry = new Map<TerminalId, TerminalDescriptor>();
  private counter = 0;

  async createTerminal(title?: string): Promise<TerminalDescriptor> {
    this.counter += 1;
    const terminalId = toTerminalId(title ?? `t${String(this.counter).padStart(2, '0')}`);
    const windowId = `@${this.counter}` as WindowId;
    const descriptor = makeDescriptor(terminalId, windowId, 10000 + this.counter, 20000 + this.counter);
    this.registry.set(terminalId, descriptor);
    return descriptor;
  }

  listTerminals(): TerminalDescriptor[] {
    return Array.from(this.registry.values());
  }

  getTerminal(terminalId: TerminalId): TerminalDescriptor | undefined {
    return this.registry.get(terminalId);
  }

  async destroyTerminal(terminalId: TerminalId): Promise<void> {
    this.registry.delete(terminalId);
  }

  async refreshSnapshot(terminalId: TerminalId): Promise<void> {
    const d = this.registry.get(terminalId);
    if (d) {
      // Simulate a fgPid change to prove snapshot is re-read.
      this.registry.set(terminalId, { ...d, fgPid: d.panePid + 9999 });
    }
  }

  resolveWindowId(terminalId: TerminalId): WindowId | undefined {
    return this.registry.get(terminalId)?.windowId;
  }

  getSessionDescriptor() {
    return {
      sessionId: 'ddx-shared',
      socketPath: '/tmp/ddx-term.sock',
      cols: 120,
      rows: 30,
      resizePolicy: DEFAULT_RESIZE_POLICY,
      inputArbitration: DEFAULT_INPUT_ARBITRATION,
      defaultTerminalId: 't01',
      createdAt: Date.now(),
    };
  }
}

// ── Shared module factory ────────────────────────────────────────────────────

async function buildModule(): Promise<TerminalService> {
  const stub = new StubSessionService();
  const module = await Test.createTestingModule({
    providers: [
      TerminalService,
      { provide: SessionService, useValue: stub },
      // TerminalService uses execFileAsync for capture-pane; stub it via token.
      { provide: EXEC_RUNNER, useValue: async () => ({ stdout: 'mock-screen\n', stderr: '' }) },
    ],
  }).compile();
  return module.get(TerminalService);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('TerminalService › create', () => {
  it('allocates a new terminal with a stable terminalId and distinct windowId', async () => {
    const svc = await buildModule();
    const descriptor = await svc.create({ title: 'term-build' });

    expect(descriptor.terminalId).toBe('term-build');
    expect(descriptor.windowId).toBeDefined();
    // terminalId and windowId must never be the same value (identity separation).
    expect(descriptor.terminalId).not.toBe(descriptor.windowId);
  });

  it('writes the terminal to the broker registry (visible via list)', async () => {
    const svc = await buildModule();
    await svc.create({ title: 'term-a' });
    await svc.create({ title: 'term-b' });

    const list = svc.list();
    expect(list).toHaveLength(2);
    const ids = list.map((d) => d.terminalId);
    expect(ids).toContain('term-a');
    expect(ids).toContain('term-b');
  });
});

describe('TerminalService › get (PID snapshot)', () => {
  it('resolves distinct panePid (shell) and fgPid (foreground child)', async () => {
    const svc = await buildModule();
    const created = await svc.create({ title: 'pid-term' });
    const descriptor = await svc.get('pid-term');

    expect(descriptor.panePid).toBeGreaterThan(0);
    expect(typeof descriptor.panePid).toBe('number');
    // fgPid is number|null — must not be undefined.
    expect(descriptor.fgPid === null || typeof descriptor.fgPid === 'number').toBe(true);
    // Snapshot was refreshed — fgPid differs from creation value.
    expect(descriptor.fgPid).not.toBe(created.fgPid);
  });

  it('throws NotFoundException for an unknown terminalId', async () => {
    const svc = await buildModule();
    await expect(svc.get('no-such-term')).rejects.toThrow(NotFoundException);
  });
});

describe('TerminalService › destroy', () => {
  it('removes the terminal from the registry', async () => {
    const svc = await buildModule();
    await svc.create({ title: 'ephemeral' });
    expect(svc.list()).toHaveLength(1);

    await svc.destroy('ephemeral');
    expect(svc.list()).toHaveLength(0);
  });

  it('throws NotFoundException when destroying an unknown terminalId', async () => {
    const svc = await buildModule();
    await expect(svc.destroy('ghost')).rejects.toThrow(NotFoundException);
  });
});

describe('TerminalService › snapshot', () => {
  it('returns the visible viewport content for a registered terminal', async () => {
    const svc = await buildModule();
    await svc.create({ title: 'snap-term' });
    const result = await svc.snapshot('snap-term');

    expect(result.terminalId).toBe('snap-term');
    expect(typeof result.content).toBe('string');
    // Snapshot is prefixed with clear-screen + cursor-home (ESC[2J ESC[H) so a
    // refresh repaints onto a clean grid from the top-left, then the captured grid.
    expect(result.content).toContain('\x1b[2J\x1b[H');
    expect(result.content).toContain('mock-screen');
    expect(result.cols).toBe(120);
    expect(result.rows).toBe(30);
    expect(result.capturedAt).toBeGreaterThan(0);
  });

  it('throws NotFoundException for an unknown terminal', async () => {
    const svc = await buildModule();
    await expect(svc.snapshot('no-snap')).rejects.toThrow(NotFoundException);
  });
});
