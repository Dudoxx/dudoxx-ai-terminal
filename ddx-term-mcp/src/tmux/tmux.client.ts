/**
 * tmux.client.ts — the ONLY door to the OS.
 *
 * A thin `execFile('tmux'|'ps'|'pgrep'|'kill', […])` wrapper. Every method maps
 * 1:1 to a known-good command string proven in SPIKE.md "Exact commands proven".
 * Every tmux call prefixes `-S <socket>` and addresses `<session>:<windowId>`.
 *
 * HARD INVARIANT (_invariants.md / MCP-SPEC §5.1): the MCP server owns no PTY —
 * no pseudo-terminal library, no raw-shell child_process. It shells out to tmux
 * against the shared session only. The single binaries it may exec are
 * `tmux`, `ps`, `pgrep`, `kill`.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Raised when an exec'd binary exits non-zero — surfaced as TMUX_ERROR. */
export class TmuxExecError extends Error {
  readonly argv: readonly string[];
  readonly stderr: string;
  constructor(argv: readonly string[], stderr: string, cause?: unknown) {
    super(`tmux exec failed: ${argv.join(' ')}\n${stderr}`, cause === undefined ? undefined : { cause });
    this.name = 'TmuxExecError';
    this.argv = argv;
    this.stderr = stderr;
  }
}

/** Config the client is constructed with (resolved from env by the server). */
export interface TmuxClientConfig {
  /** tmux `-S` socket path (the shared session's socket). */
  readonly socket: string;
  /** The session hosting all terminals (windows). */
  readonly session: string;
}

/** One window row parsed from `list-windows`. */
export interface TmuxWindowRow {
  readonly windowId: string;
  readonly windowName: string;
  readonly panePid: number;
  readonly command: string;
  readonly cwd: string;
  readonly active: boolean;
}

/** One pane row parsed from `list-panes`. */
export interface TmuxPaneRow {
  readonly paneId: string;
  readonly width: number;
  readonly height: number;
  readonly command: string;
}

/** One process row parsed from `ps`. */
export interface PsRow {
  readonly pid: number;
  readonly ppid: number;
  readonly stat: string;
  readonly command: string;
}

/**
 * A thin, side-effect-only wrapper over the tmux/ps/pgrep/kill binaries. Holds
 * no state of its own; all terminal identity lives in the resolver + cursor.
 */
export class TmuxClient {
  constructor(private readonly config: TmuxClientConfig) {}

  /** `<session>:<windowId>` target string for the `-t` flag. */
  private target(windowId: string): string {
    return `${this.config.session}:${windowId}`;
  }

  /** Run `tmux -S <socket> <args…>`; throw TmuxExecError on non-zero exit. */
  private async tmux(args: readonly string[]): Promise<string> {
    const argv = ['-S', this.config.socket, ...args];
    try {
      const { stdout } = await execFileAsync('tmux', argv);
      return stdout;
    } catch (err) {
      const stderr =
        typeof err === 'object' && err !== null && 'stderr' in err
          ? String((err as { stderr: unknown }).stderr)
          : '';
      throw new TmuxExecError(['tmux', ...argv], stderr, err);
    }
  }

  // ── session lifecycle (used by the broker/e2e harness, not a verb) ─────────

  /** True when the configured session exists on the socket. */
  async hasSession(): Promise<boolean> {
    try {
      await this.tmux(['has-session', '-t', this.config.session]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create the shared session detached, with an isolated config (`-f /dev/null`)
   * and a concrete default size — NEVER `window-size manual` (SPIKE footgun #1).
   */
  async newSession(cols: number, lines: number): Promise<void> {
    // -f /dev/null is a tmux GLOBAL flag (precedes the command), so it cannot go
    // through `tmux()` which always injects -S first. Exec directly.
    const argv = [
      '-f',
      '/dev/null',
      '-S',
      this.config.socket,
      'new-session',
      '-d',
      '-s',
      this.config.session,
      '-x',
      String(cols),
      '-y',
      String(lines),
    ];
    try {
      await execFileAsync('tmux', argv);
    } catch (err) {
      const stderr =
        typeof err === 'object' && err !== null && 'stderr' in err
          ? String((err as { stderr: unknown }).stderr)
          : '';
      throw new TmuxExecError(['tmux', ...argv], stderr, err);
    }
    // Pin the default size so clientless windows have defined dimensions.
    await this.tmux(['set-option', '-g', 'default-size', `${cols}x${lines}`]);
  }

  /** Kill the whole session+socket (e2e teardown). */
  async killServer(): Promise<void> {
    try {
      await this.tmux(['kill-server']);
    } catch {
      /* already gone — teardown is best-effort */
    }
  }

  // ── window lifecycle ───────────────────────────────────────────────────────

  /**
   * `new-window` → returns the new windowId + its pane pid. `name` becomes the
   * window name; `cwd` sets `-c`.
   */
  async newWindow(name: string | undefined, cwd: string | undefined): Promise<{ windowId: string; panePid: number; cwd: string }> {
    const args = ['new-window', '-t', this.config.session, '-P', '-F', '#{window_id}\t#{pane_pid}\t#{pane_current_path}'];
    if (name !== undefined) args.push('-n', name);
    if (cwd !== undefined) args.push('-c', cwd);
    const out = (await this.tmux(args)).trim();
    const [windowId, panePidRaw, paneCwd] = out.split('\t');
    if (windowId === undefined || panePidRaw === undefined || paneCwd === undefined) {
      throw new TmuxExecError(['tmux', ...args], `unparseable new-window output: ${out}`);
    }
    return { windowId, panePid: Number.parseInt(panePidRaw, 10), cwd: paneCwd };
  }

  /** `kill-window` for the addressed window. */
  async killWindow(windowId: string): Promise<void> {
    await this.tmux(['kill-window', '-t', this.target(windowId)]);
  }

  /**
   * `list-windows` with a tab-delimited format → one TmuxWindowRow per window.
   * Format: window_id, window_name, pane_pid, pane_current_command,
   * pane_current_path, window_active.
   */
  async listWindows(): Promise<TmuxWindowRow[]> {
    const fmt = '#{window_id}\t#{window_name}\t#{pane_pid}\t#{pane_current_command}\t#{pane_current_path}\t#{window_active}';
    const out = await this.tmux(['list-windows', '-t', this.config.session, '-F', fmt]);
    return out
      .split('\n')
      .filter((l) => l.length > 0)
      .map((line): TmuxWindowRow => {
        const [windowId, windowName, panePid, command, cwd, active] = line.split('\t');
        return {
          windowId: windowId ?? '',
          windowName: windowName ?? '',
          panePid: Number.parseInt(panePid ?? '0', 10),
          command: command ?? '',
          cwd: cwd ?? '',
          active: active === '1',
        };
      });
  }

  // ── send (the two-call literal+Enter discipline lives in the verb) ─────────

  /**
   * `send-keys -l <text>` — LITERAL text, typed verbatim. No key-name parsing.
   * The newline is a SEPARATE `sendKey('Enter')` call (invariant 4 / SPIKE).
   */
  async sendKeysLiteral(windowId: string, text: string): Promise<void> {
    await this.tmux(['send-keys', '-t', this.target(windowId), '-l', text]);
  }

  /**
   * `send-keys <keyName>` — a tmux KEY NAME (Enter, Up, Down, C-c, …), NOT
   * literal. Used for the Enter after literal text, control signals, and TUI nav.
   */
  async sendKey(windowId: string, keyName: string): Promise<void> {
    await this.tmux(['send-keys', '-t', this.target(windowId), keyName]);
  }

  // ── capture (two modes — viewport snapshot vs scrollback delta) ────────────

  /**
   * VISIBLE viewport only — `capture-pane -p` WITHOUT `-S`. The on-screen
   * cols×lines grid (TUI frame, prompt, spinner). `-e` adds ANSI escapes.
   */
  async capturePaneVisible(windowId: string, withAnsi: boolean): Promise<string> {
    const args = ['capture-pane', '-p', '-t', this.target(windowId)];
    if (withAnsi) args.push('-e');
    return this.tmux(args);
  }

  /**
   * SCROLLBACK — `capture-pane -p -S -<startLine>` (history above the viewport).
   * `startLine` is the number of history lines to include (positive count).
   */
  async capturePaneScrollback(windowId: string, startLine: number): Promise<string> {
    return this.tmux(['capture-pane', '-p', '-t', this.target(windowId), '-S', `-${startLine}`]);
  }

  // ── introspection ──────────────────────────────────────────────────────────

  /** `display-message -p '#{pane_pid}'` → the pane's shell pid. */
  async panePid(windowId: string): Promise<number> {
    const out = (await this.tmux(['display-message', '-p', '-t', this.target(windowId), '#{pane_pid}'])).trim();
    return Number.parseInt(out, 10);
  }

  /** `display-message -p '#{pane_width}x#{pane_height}'` → grid dimensions. */
  async paneDimensions(windowId: string): Promise<{ cols: number; lines: number }> {
    const out = (await this.tmux(['display-message', '-p', '-t', this.target(windowId), '#{pane_width}x#{pane_height}'])).trim();
    const [cols, lines] = out.split('x');
    return { cols: Number.parseInt(cols ?? '0', 10), lines: Number.parseInt(lines ?? '0', 10) };
  }

  /** `list-panes` → the splits within one window + their dimensions. */
  async listPanes(windowId: string): Promise<TmuxPaneRow[]> {
    const fmt = '#{pane_id}\t#{pane_width}\t#{pane_height}\t#{pane_current_command}';
    const out = await this.tmux(['list-panes', '-t', this.target(windowId), '-F', fmt]);
    return out
      .split('\n')
      .filter((l) => l.length > 0)
      .map((line): TmuxPaneRow => {
        const [paneId, width, height, command] = line.split('\t');
        return {
          paneId: paneId ?? '',
          width: Number.parseInt(width ?? '0', 10),
          height: Number.parseInt(height ?? '0', 10),
          command: command ?? '',
        };
      });
  }

  // ── process tree (the pid-side identity, distinct from terminalId) ─────────

  /** `pgrep -P <panePid>` → direct child pids of the pane shell. Empty = none. */
  async childPids(panePid: number): Promise<number[]> {
    try {
      const { stdout } = await execFileAsync('pgrep', ['-P', String(panePid)]);
      return stdout
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .map((l) => Number.parseInt(l, 10))
        .filter((n) => Number.isInteger(n));
    } catch {
      // pgrep exits 1 when no processes match — that is "no children", not error.
      return [];
    }
  }

  /**
   * The FULL descendant process tree of `panePid` (children, grandchildren, …),
   * via a breadth-first `pgrep -P` walk. Distinct from `childPids` (depth-1):
   * the pid-signal containment boundary (FM#4 / invariant 5) must cover the WHOLE
   * tree — a grandchild (shell→make→cc) belongs to the terminal too. Portable —
   * `pgrep -P` runs on macOS; `pgrep --ns` (Linux-only) is deliberately avoided.
   * A visited-set guards against cycles and a depth cap bounds pathological trees.
   */
  async descendantPids(panePid: number): Promise<number[]> {
    const MAX_DEPTH = 64;
    const visited = new Set<number>();
    let frontier = [panePid];
    for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0; depth += 1) {
      const childLevels = await Promise.all(frontier.map((pid) => this.childPids(pid)));
      const next: number[] = [];
      for (const child of childLevels.flat()) {
        // Skip panePid itself and any pid already walked (cycle guard).
        if (child === panePid || visited.has(child)) continue;
        visited.add(child);
        next.push(child);
      }
      frontier = next;
    }
    return [...visited];
  }

  /** `ps -o pid,ppid,stat,command -p <pids…>` → process rows for the given pids. */
  async psRows(pids: readonly number[]): Promise<PsRow[]> {
    if (pids.length === 0) return [];
    try {
      const { stdout } = await execFileAsync('ps', ['-o', 'pid=,ppid=,stat=,command=', '-p', pids.join(',')]);
      return stdout
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .map((line): PsRow => {
          // pid ppid stat command… — split on whitespace, keep command intact.
          const match = /^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line);
          if (match === null) return { pid: 0, ppid: 0, stat: '', command: line };
          return {
            pid: Number.parseInt(match[1] ?? '0', 10),
            ppid: Number.parseInt(match[2] ?? '0', 10),
            stat: match[3] ?? '',
            command: match[4] ?? '',
          };
        });
    } catch {
      return [];
    }
  }

  /** `kill -<signal> <pid>` for a specific, already-validated child process. */
  async killPid(signal: string, pid: number): Promise<void> {
    try {
      await execFileAsync('kill', [`-${signal}`, String(pid)]);
    } catch (err) {
      const stderr =
        typeof err === 'object' && err !== null && 'stderr' in err
          ? String((err as { stderr: unknown }).stderr)
          : '';
      throw new TmuxExecError(['kill', `-${signal}`, String(pid)], stderr, err);
    }
  }
}
