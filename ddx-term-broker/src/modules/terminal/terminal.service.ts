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

  async destroy(rawId: string): Promise<void> {
    const terminalId = toTerminalId(rawId);
    const descriptor = this.sessionService.getTerminal(terminalId);
    if (!descriptor) {
      throw new NotFoundException(`Terminal not found: ${rawId}`);
    }
    await this.sessionService.destroyTerminal(terminalId);
    this.logger.log(`Terminal destroyed via REST: ${rawId}`);
  }

  /**
   * Capture the VISIBLE viewport grid for a terminal — term_snapshot.
   * Uses `capture-pane -p` WITHOUT `-S` so only the visible screen is
   * returned (O(grid), not O(scrollback)). See RESPONSIVENESS §2.9.
   */
  async snapshot(rawId: string): Promise<SnapshotResult> {
    const terminalId = toTerminalId(rawId);
    const descriptor = this.sessionService.getTerminal(terminalId);
    if (!descriptor) {
      throw new NotFoundException(`Terminal not found: ${rawId}`);
    }

    const target = `${SESSION_NAME}:${descriptor.windowId}`;
    const { stdout } = await this.exec('tmux', tmux(
      'capture-pane', '-t', target, '-p',
    ));

    const sessionDesc = this.sessionService.getSessionDescriptor();
    return {
      terminalId,
      content: stdout,
      cols: sessionDesc.cols,
      rows: sessionDesc.rows,
      capturedAt: Date.now(),
    };
  }
}
