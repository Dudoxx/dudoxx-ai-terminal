/**
 * TerminalService — per-terminal CRUD over tmux windows.
 *
 * The broker is the SINGLE writer of the terminalId↔windowId registry (shard
 * 06). This service delegates to SessionService for all registry mutations and
 * PID resolution; it does not maintain its own state.
 *
 * REST verbs mirror MCP verbs (reciprocal pair, ARCHITECTURE §5 Flow B):
 *   POST   /terminals          → term_create  (allocates window, writes registry)
 *   GET    /terminals          → term_list    (reads registry)
 *   GET    /terminals/:id      → term_ps      (reads descriptor + live snapshot)
 *   GET    /terminals/:id/snapshot → term_snapshot (capture-pane visible grid)
 *   DELETE /terminals/:id      → term_destroy (kill-window, clears registry)
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { Injectable, NotFoundException, Logger, Inject, Optional } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { toTerminalId, type TerminalDescriptor, type TerminalId } from '@ddx/term-contract';
import {
  SessionService,
  EXEC_RUNNER,
  type ExecRunner,
} from '../session/session.service';

const defaultExec: ExecRunner = promisify(execFile);

const SESSION_NAME = process.env['DDX_TERM_SESSION'] ?? 'ddx-shared';
const SOCKET_PATH = process.env['DDX_TERM_SOCKET'] ?? '/tmp/ddx-term.sock';

function tmux(...args: string[]): string[] {
  return ['-S', SOCKET_PATH, ...args];
}

export interface CreateTerminalDto {
  title?: string;
}

export interface SnapshotResult {
  terminalId: TerminalId;
  content: string;
  cols: number;
  rows: number;
  capturedAt: number;
}

@Injectable()
export class TerminalService {
  private readonly logger = new Logger(TerminalService.name);
  private readonly exec: ExecRunner;

  constructor(
    private readonly sessionService: SessionService,
    @Optional() @Inject(EXEC_RUNNER) execRunner: ExecRunner | null,
  ) {
    this.exec = execRunner ?? defaultExec;
  }

  async create(dto: CreateTerminalDto): Promise<TerminalDescriptor> {
    return this.sessionService.createTerminal(dto.title);
  }

  list(): TerminalDescriptor[] {
    return this.sessionService.listTerminals();
  }

  async get(rawId: string): Promise<TerminalDescriptor> {
    const terminalId = toTerminalId(rawId);
    const descriptor = this.sessionService.getTerminal(terminalId);
    if (!descriptor) {
      throw new NotFoundException(`Terminal not found: ${rawId}`);
    }
    // Refresh snapshot fields before returning (panePid/fgPid are transient).
    await this.sessionService.refreshSnapshot(terminalId);
    return this.sessionService.getTerminal(terminalId) as TerminalDescriptor;
  }

  /**
   * DELETE /terminals/:id — idempotent (0.C): destroying an already-gone
   * terminal is success (204), not a 404. The desired end-state (no such
   * terminal) already holds, so a tab-close retry never surfaces an error. The
   * underlying SessionService.destroyTerminal is itself idempotent over a
   * missing tmux window; here we tolerate a missing REGISTRY entry the same way.
   */
  async destroy(rawId: string): Promise<void> {
    const terminalId = toTerminalId(rawId);
    const descriptor = this.sessionService.getTerminal(terminalId);
    if (!descriptor) {
      this.logger.log(`Terminal already gone, destroy is a no-op: ${rawId}`);
      return;
    }
    await this.sessionService.destroyTerminal(terminalId);
    this.logger.log(`Terminal destroyed via REST: ${rawId}`);
  }

  /**
   * Capture the VISIBLE viewport for a terminal — term_snapshot.
   *
   * To make a browser refresh restore the FULL on-screen state (not just plain
   * text), the snapshot is built so xterm repaints it faithfully:
   *   • `capture-pane -e -p` — `-e` emits SGR escape sequences, preserving the
   *     colors/attributes already on screen (a plain `-p` capture loses them).
   *   • A leading `ESC[2J ESC[H` (clear + home) so the snapshot paints onto a
   *     clean grid from the top-left, not appended after whatever was there.
   *   • A trailing `ESC[<row>;<col>H` built from tmux `cursor_y`/`cursor_x`
   *     (1-based) so the cursor lands exactly where the shell's cursor is — the
   *     "cursor position not maintained on refresh" fix.
   * Still visible-only (no `-S`) so it stays O(grid), not O(scrollback)
   * (RESPONSIVENESS §2.9).
   */
  async snapshot(rawId: string): Promise<SnapshotResult> {
    const terminalId = toTerminalId(rawId);
    const descriptor = this.sessionService.getTerminal(terminalId);
    if (!descriptor) {
      throw new NotFoundException(`Terminal not found: ${rawId}`);
    }

    const ESC = String.fromCharCode(27);
    const target = `${SESSION_NAME}:${descriptor.windowId}`;
    const { stdout: grid } = await this.exec('tmux', tmux(
      'capture-pane', '-t', target, '-e', '-p',
    ));

    // tmux cursor position (0-based) → terminal CUP escape (1-based row;col).
    let cursorSeq = '';
    try {
      const { stdout: pos } = await this.exec('tmux', tmux(
        'display-message', '-t', target, '-p', '#{cursor_y} #{cursor_x}',
      ));
      const [yStr, xStr] = pos.trim().split(/\s+/);
      const row = Number(yStr);
      const col = Number(xStr);
      if (Number.isFinite(row) && Number.isFinite(col)) {
        cursorSeq = `${ESC}[${row + 1};${col + 1}H`;
      }
    } catch {
      // Cursor position is best-effort — fall back to no explicit positioning.
    }

    // Clear + home (ESC[2J ESC[H), paint the attributed grid, then place the
    // cursor (ESC[row;colH) so a refresh restores the exact on-screen state.
    const content = `${ESC}[2J${ESC}[H${grid}${cursorSeq}`;

    const sessionDesc = this.sessionService.getSessionDescriptor();
    return {
      terminalId,
      content,
      cols: sessionDesc.cols,
      rows: sessionDesc.rows,
      capturedAt: Date.now(),
    };
  }
}
