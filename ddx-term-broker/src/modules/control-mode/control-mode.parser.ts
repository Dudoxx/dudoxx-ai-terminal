/**
 * control-mode.parser.ts — parse tmux -CC control-mode stdout into typed frames.
 *
 * tmux control-mode emits newline-delimited lines of the form:
 *   %output %<pane-id> <base64-or-raw-data>
 *   %layout-change <window-id> <layout-string>
 *   %window-add <window-id>
 *   %window-close <window-id>
 *   %session-changed <session-id> <name>
 *   %begin <timestamp> <flags>
 *   %end   <timestamp> <flags>
 *   %error <timestamp> <flags> <message>
 *
 * The parser consumes lines INCREMENTALLY (never buffers whole screens).
 * Each recognised line is mapped to a typed ServerFrame from @ddx/term-contract.
 * Unknown/unsupported lines are silently dropped (open protocol — v2 may add).
 *
 * The caller supplies a terminalId resolver so the parser stays pure (no
 * registry dependency) and can be unit-tested with golden fixtures.
 *
 * ARCHITECTURE §3 + RESPONSIVENESS §2.2 — incremental, never whole-screen.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import {
  type ServerFrame,
  type TerminalId,
  type WindowId,
} from '@ddx/term-contract';

/**
 * Resolves a tmux windowId (e.g. '@7') to the broker's terminalId.
 * Returns undefined when the window is not registered (race on window-add).
 */
export type WindowIdResolver = (windowId: WindowId) => TerminalId | undefined;

/** A parsed control-mode line ready to be fanned out. */
export type ParsedFrame =
  | { kind: 'frame'; frame: ServerFrame }
  | { kind: 'unknown'; raw: string };

/**
 * Parse a single tmux control-mode output line into a typed frame.
 *
 * @param line     — one complete line from tmux -CC stdout (no trailing \n)
 * @param resolve  — maps tmux windowId → terminalId for routing
 */
export function parseControlModeLine(
  line: string,
  resolve: WindowIdResolver,
): ParsedFrame {
  if (line.startsWith('%output ')) {
    return parseOutputLine(line, resolve);
  }
  if (line.startsWith('%layout-change ')) {
    return parseLayoutChangeLine(line, resolve);
  }
  if (line.startsWith('%window-add ')) {
    return parseWindowAddLine(line, resolve);
  }
  if (line.startsWith('%window-close ')) {
    return parseWindowCloseLine(line, resolve);
  }
  // %begin / %end / %session-changed / %exit — control flow, not output frames.
  return { kind: 'unknown', raw: line };
}

// ── individual line parsers ───────────────────────────────────────────────────

/**
 * %output %<pane-id> <data>
 *
 * tmux encodes %output data as octal sequences (\NNN) for non-printable bytes.
 * We forward the raw string; xterm.js handles the decode.
 * The pane-id is a pane specifier ('%<N>'), NOT a window id — we look up the
 * window via display-message externally; here we receive the pre-resolved
 * terminalId from the attach layer.
 */
function parseOutputLine(line: string, resolve: WindowIdResolver): ParsedFrame {
  // Format: %output %<pane-id> <data...>
  // The pane-id token starts with %, e.g. %3
  const spaceAfterCmd = line.indexOf(' ', 8); // after '%output '
  if (spaceAfterCmd === -1) return { kind: 'unknown', raw: line };

  const paneToken = line.slice(8, spaceAfterCmd); // e.g. '%3'
  const data = line.slice(spaceAfterCmd + 1);

  // The attach layer converts pane-id → windowId before calling us.
  // We receive the windowId directly as the pane token in broker-mode.
  const windowId = paneToken as WindowId;
  const terminalId = resolve(windowId);
  if (!terminalId) return { kind: 'unknown', raw: line };

  const frame: ServerFrame = {
    type: 'output',
    terminalId,
    data,
    withAnsi: true,
  };
  return { kind: 'frame', frame };
}

/**
 * %layout-change <window-id> <layout-string>
 *
 * The layout string encodes pane geometry, e.g.:
 *   120x30,0,0,1
 * We parse cols×rows from the first segment.
 */
function parseLayoutChangeLine(line: string, resolve: WindowIdResolver): ParsedFrame {
  // Format: %layout-change <window-id> <layout>
  const parts = line.split(' ');
  // parts[0] = '%layout-change', parts[1] = window-id, parts[2] = layout
  if (parts.length < 3) return { kind: 'unknown', raw: line };

  const windowId = parts[1] as WindowId;
  const layout = parts[2] ?? '';
  const terminalId = resolve(windowId);
  if (!terminalId) return { kind: 'unknown', raw: line };

  // Parse WxH from layout string (first segment before comma).
  const dimMatch = /^(\d+)x(\d+)/.exec(layout);
  const cols = dimMatch ? parseInt(dimMatch[1] ?? '120', 10) : 120;
  const rows = dimMatch ? parseInt(dimMatch[2] ?? '30', 10) : 30;

  const frame: ServerFrame = {
    type: 'layout-change',
    terminalId,
    cols,
    rows,
    layout,
  };
  return { kind: 'frame', frame };
}

/**
 * %window-add <window-id>
 *
 * A new window appeared (e.g. agent called new-window). The resolver may not
 * know it yet (race); we emit a window-add frame so the web client can
 * subscribe while the registry is being updated.
 */
function parseWindowAddLine(line: string, resolve: WindowIdResolver): ParsedFrame {
  const parts = line.split(' ');
  if (parts.length < 2) return { kind: 'unknown', raw: line };

  const windowId = parts[1] as WindowId;
  // Best-effort resolve — may be undefined during the create race.
  const terminalId = resolve(windowId) ?? (windowId as unknown as TerminalId);

  const frame: ServerFrame = {
    type: 'window-add',
    terminalId,
    windowId,
  };
  return { kind: 'frame', frame };
}

/**
 * %window-close <window-id>
 */
function parseWindowCloseLine(line: string, resolve: WindowIdResolver): ParsedFrame {
  const parts = line.split(' ');
  if (parts.length < 2) return { kind: 'unknown', raw: line };

  const windowId = parts[1] as WindowId;
  const terminalId = resolve(windowId) ?? (windowId as unknown as TerminalId);

  const frame: ServerFrame = {
    type: 'window-close',
    terminalId,
    windowId,
  };
  return { kind: 'frame', frame };
}
