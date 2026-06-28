/**
 * SessionService — owns the shared tmux session and the canonical terminal
 * registry (terminalId↔windowId + process snapshots).
 *
 * SPIKE-CRITICAL boot sequence (_invariants.md):
 *   1. Create: `tmux -f /dev/null -S $SOCK new-session -d -s ddx-shared -x 120 -y 30`
 *      — `-f /dev/null` MANDATORY: never inherit ~/.tmux.conf (footgun #2).
 *   2. Pin:    `tmux -S $SOCK set-option -g default-size 120x30`
 *      — NEVER `set-window-option -g window-size manual` (footgun #1: kills
 *        tmux 3.6a server on new-window in a detached session).
 *
 * Registry rule (ARCHITECTURE §3a / shard 06):
 *   - terminalId↔windowId is the ONLY durable binding.
 *   - panePid / fgPid / cwd / command are SNAPSHOTS — re-read on demand,
 *     never stored as identity (FM#4).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  Optional,
} from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  type TerminalDescriptor,
  type TerminalId,
  type WindowId,
  type SessionDescriptor,
  DEFAULT_RESIZE_POLICY,
  DEFAULT_INPUT_ARBITRATION,
  toTerminalId,
} from '@ddx/term-contract';

/** Injection token for the exec runner (replaced in tests). */
export const EXEC_RUNNER = 'EXEC_RUNNER';

/** Return type of an exec call. */
export interface ExecResult {
  stdout: string;
  stderr: string;
}

/** Async function that runs a process and returns stdout/stderr. */
export type ExecRunner = (file: string, args: string[]) => Promise<ExecResult>;

const defaultExecRunner: ExecRunner = promisify(execFile);

/** Environment-configurable session constants. */
const SESSION_NAME = process.env['DDX_TERM_SESSION'] ?? 'ddx-shared';
const SOCKET_PATH = process.env['DDX_TERM_SOCKET'] ?? '/tmp/ddx-term.sock';
const SESSION_COLS = 120;
const SESSION_ROWS = 30;

/** tmux argv builder — always uses -S $SOCK to target our isolated socket. */
function tmux(...args: string[]): string[] {
  return ['-S', SOCKET_PATH, ...args];
}

export interface PidSnapshot {
  panePid: number;
  fgPid: number | null;
}

@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionService.name);
  private readonly exec: ExecRunner;

  /** Canonical terminal registry: terminalId → descriptor (durable binding). */
  private readonly registry = new Map<TerminalId, TerminalDescriptor>();

  /** Monotonic window counter for auto-generated terminalIds (t01, t02, …). */
  private windowCounter = 0;

  /** Epoch ms of session creation (set in onModuleInit). */
  private sessionCreatedAt = 0;

  constructor(
    @Optional() @Inject(EXEC_RUNNER) execRunner: ExecRunner | null,
  ) {
    this.exec = execRunner ?? defaultExecRunner;
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    await this.ensureSession();
    this.logger.log(
      `Session '${SESSION_NAME}' ready on socket ${SOCKET_PATH}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    // The session is deliberately NOT killed on shutdown — it must survive
    // broker restarts so the human's viewport and agent's state are preserved
    // (AC #5: reconnect restores live session + scrollback).
    this.logger.log(
      `Broker shutting down — tmux session '${SESSION_NAME}' left alive`,
    );
  }

  // ── public API ───────────────────────────────────────────────────────────

  /**
   * Returns the session descriptor with canonical dimensions and policies.
   * The descriptor shape is defined in @ddx/term-contract (session.ts).
   */
  getSessionDescriptor(): SessionDescriptor {
    return {
      sessionId: SESSION_NAME,
      socketPath: SOCKET_PATH,
      cols: SESSION_COLS,
      rows: SESSION_ROWS,
      resizePolicy: DEFAULT_RESIZE_POLICY,
      inputArbitration: DEFAULT_INPUT_ARBITRATION,
      defaultTerminalId: 't01',
      createdAt: this.sessionCreatedAt,
    };
  }

  /** Returns true when the tmux socket file exists and the session is alive. */
  async isHealthy(): Promise<boolean> {
    try {
      await this.exec('tmux', tmux('has-session', '-t', SESSION_NAME));
      return true;
    } catch {
      return false;
    }
  }

  /** All terminals currently in the registry (broker-canonical list). */
  listTerminals(): TerminalDescriptor[] {
    return Array.from(this.registry.values());
  }

  /** Resolve a terminalId to its descriptor, or undefined if not registered. */
  getTerminal(terminalId: TerminalId): TerminalDescriptor | undefined {
    return this.registry.get(terminalId);
  }

  /**
   * Allocate a new tmux window and register it.
   * Window 0 = human; agent windows start at 1 (AGENT_OWN_WINDOW, AC #9).
   * Returns the new descriptor with SNAPSHOT pids (re-read after creation).
   */
  async createTerminal(title?: string): Promise<TerminalDescriptor> {
    // new-window: -d = detached (don't switch to it), -P -F = print window id
    const { stdout } = await this.exec('tmux', [
      ...tmux('new-window', '-t', SESSION_NAME, '-d', '-P', '-F', '#{window_id}'),
    ]);
    const rawWindowId = stdout.trim();
    if (!rawWindowId) {
      throw new Error('tmux new-window returned empty window id');
    }
    const windowId = rawWindowId as WindowId;

    // Auto-generate terminalId if no title slug is given.
    this.windowCounter += 1;
    const slug = title
      ? title.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 32)
      : `t${String(this.windowCounter).padStart(2, '0')}`;
    const terminalId = toTerminalId(slug);

    // Set the window title inside tmux for human-facing labeling.
    const label = title ?? slug;
    await this.exec('tmux', [
      ...tmux('rename-window', '-t', `${SESSION_NAME}:${rawWindowId}`, label),
    ]);

    // Read initial SNAPSHOT pids — these are transient, not identity.
    const pids = await this.resolvePids(windowId);

    const descriptor: TerminalDescriptor = {
      terminalId,
      windowId,
      title: label,
      panePid: pids.panePid,
      fgPid: pids.fgPid,
      cwd: await this.resolveCwd(windowId),
      command: await this.resolveCommand(windowId),
      createdAt: Date.now(),
    };

    this.registry.set(terminalId, descriptor);
    this.logger.log(
      `Terminal created: ${terminalId} → ${windowId} (panePid=${pids.panePid})`,
    );
    return descriptor;
  }

  /**
   * Destroy a terminal: kill the tmux window and remove from registry.
   * Throws if terminalId is not registered.
   */
  async destroyTerminal(terminalId: TerminalId): Promise<void> {
    const descriptor = this.registry.get(terminalId);
    if (!descriptor) {
      throw new Error(`Terminal not found: ${terminalId}`);
    }
    await this.exec('tmux', [
      ...tmux('kill-window', '-t', `${SESSION_NAME}:${descriptor.windowId}`),
    ]);
    this.registry.delete(terminalId);
    this.logger.log(`Terminal destroyed: ${terminalId} (${descriptor.windowId})`);
  }

  /**
   * Re-read SNAPSHOT fields for a terminal (panePid/fgPid/cwd/command).
   * Updates the registry entry in place and returns fresh pids.
   * Callers that need the live process state (term_ps / term_panes) invoke this.
   */
  async refreshSnapshot(terminalId: TerminalId): Promise<PidSnapshot> {
    const descriptor = this.registry.get(terminalId);
    if (!descriptor) {
      throw new Error(`Terminal not found: ${terminalId}`);
    }
    const pids = await this.resolvePids(descriptor.windowId);
    const updated: TerminalDescriptor = {
      ...descriptor,
      panePid: pids.panePid,
      fgPid: pids.fgPid,
      cwd: await this.resolveCwd(descriptor.windowId),
      command: await this.resolveCommand(descriptor.windowId),
    };
    this.registry.set(terminalId, updated);
    return pids;
  }

  /**
   * Resolve windowId for a terminalId (used by the WS gateway and MCP resolver).
   * Returns undefined when not registered (caller decides how to handle).
   */
  resolveWindowId(terminalId: TerminalId): WindowId | undefined {
    return this.registry.get(terminalId)?.windowId;
  }

  /**
   * Reverse lookup: resolve terminalId for a tmux windowId.
   * Used by the control-mode attach loop (WindowIdResolver) to route inbound
   * %output / %layout-change / %window-add / %window-close frames to the
   * correct WebSocket subscribers. Returns undefined for unregistered windows.
   */
  resolveTerminalId(windowId: WindowId): TerminalId | undefined {
    for (const descriptor of this.registry.values()) {
      if (descriptor.windowId === windowId) {
        return descriptor.terminalId;
      }
    }
    return undefined;
  }

  // ── private helpers ──────────────────────────────────────────────────────

  /**
   * Ensure the shared session exists. Creates it when absent.
   *
   * SPIKE-CRITICAL: uses `-f /dev/null` to prevent inheriting ~/.tmux.conf
   * (footgun #2). Pins size with `set-option -g default-size WxH` (footgun #1:
   * NEVER `set-window-option -g window-size manual`).
   */
  private async ensureSession(): Promise<void> {
    const alive = await this.isHealthy();
    if (alive) {
      this.logger.log(`Reusing existing session '${SESSION_NAME}'`);
      this.sessionCreatedAt = Date.now();
      return;
    }

    this.logger.log(`Creating session '${SESSION_NAME}' on ${SOCKET_PATH} …`);

    // Step 1 — create the session with an isolated config file and pinned size.
    // -f /dev/null: empty config, never inherits ~/.tmux.conf (SPIKE footgun #2).
    // -x/-y: initial dimensions so detached windows have a concrete size.
    await this.exec('tmux', [
      '-f', '/dev/null',
      '-S', SOCKET_PATH,
      'new-session', '-d',
      '-s', SESSION_NAME,
      '-x', String(SESSION_COLS),
      '-y', String(SESSION_ROWS),
    ]);
    this.sessionCreatedAt = Date.now();

    // Step 2 — pin canonical dimensions via default-size (NOT window-size manual).
    // `set-option -g default-size WxH` gives detached windows a concrete size
    // without the tmux 3.6a crash: `window-size manual` + new-window on a
    // detached (clientless) session kills the server (SPIKE footgun #1).
    await this.exec('tmux', [
      ...tmux('set-option', '-g', 'default-size', `${SESSION_COLS}x${SESSION_ROWS}`),
    ]);

    this.logger.log(
      `Session '${SESSION_NAME}' created — ${SESSION_COLS}x${SESSION_ROWS}, socket ${SOCKET_PATH}`,
    );
  }

  /**
   * Read panePid (shell) and fgPid (foreground child) for a window.
   * Both are SNAPSHOTS — transient OS pids, never stored as terminal identity.
   *
   * panePid = #{pane_pid} (the shell process).
   * fgPid   = first child of panePid via `pgrep -P` (the foreground program),
   *           or null when the shell is at the prompt with no child.
   */
  async resolvePids(windowId: WindowId): Promise<PidSnapshot> {
    const target = `${SESSION_NAME}:${windowId}`;

    // Read the pane's shell pid.
    const { stdout: pidOut } = await this.exec('tmux', [
      ...tmux('display-message', '-t', target, '-p', '#{pane_pid}'),
    ]);
    const panePid = parseInt(pidOut.trim(), 10);
    if (isNaN(panePid) || panePid <= 0) {
      throw new Error(`Could not resolve pane_pid for window ${windowId}`);
    }

    // Resolve the foreground child (the program running IN the shell).
    let fgPid: number | null = null;
    try {
      const { stdout: pgrepOut } = await this.exec('pgrep', [
        '-P', String(panePid),
      ]);
      const child = parseInt(pgrepOut.trim().split('\n')[0] ?? '', 10);
      if (!isNaN(child) && child > 0) {
        fgPid = child;
      }
    } catch {
      // pgrep exits non-zero when no children exist (shell at prompt) — normal.
      fgPid = null;
    }

    return { panePid, fgPid };
  }

  private async resolveCwd(windowId: WindowId): Promise<string> {
    try {
      const { stdout } = await this.exec('tmux', [
        ...tmux(
          'display-message', '-t', `${SESSION_NAME}:${windowId}`,
          '-p', '#{pane_current_path}',
        ),
      ]);
      return stdout.trim();
    } catch {
      return '';
    }
  }

  private async resolveCommand(windowId: WindowId): Promise<string> {
    try {
      const { stdout } = await this.exec('tmux', [
        ...tmux(
          'display-message', '-t', `${SESSION_NAME}:${windowId}`,
          '-p', '#{pane_current_command}',
        ),
      ]);
      return stdout.trim();
    } catch {
      return '';
    }
  }
}
