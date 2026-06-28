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

/**
 * Resolves a tmux paneId (e.g. '%3') to the broker's terminalId.
 * Used ONLY for `%output` lines, which are pane-keyed (NOT window-keyed). The
 * registry is window-keyed, so this hops paneId → windowId → terminalId in
 * SessionService. Returns undefined for unknown panes (frame dropped).
 */
export type PaneIdResolver = (paneId: string) => TerminalId | undefined;

/**
 * The two resolvers the parser needs. Kept distinct so an `%output` pane-id is
 * never resolved against the window registry (the bug that dropped all frames).
 */
export interface FrameResolvers {
  resolveWindow: WindowIdResolver;
  resolvePane: PaneIdResolver;
}

/** A parsed control-mode line ready to be fanned out. */
export type ParsedFrame =
  | { kind: 'frame'; frame: ServerFrame }
  | { kind: 'unknown'; raw: string };

/**
 * Parse a single tmux control-mode output line into a typed frame.
 *
 * @param line       — one complete line from tmux -CC stdout (no trailing \n)
 * @param resolvers  — pane resolver (for %output) + window resolver (for the rest)
 */
export function parseControlModeLine(
  line: string,
  resolvers: FrameResolvers,
): ParsedFrame {
  if (line.startsWith('%output ')) {
    // %output is PANE-keyed — resolve via the pane resolver, not the window one.
    return parseOutputLine(line, resolvers.resolvePane);
  }
  if (line.startsWith('%layout-change ')) {
    return parseLayoutChangeLine(line, resolvers.resolveWindow);
  }
  if (line.startsWith('%window-add ')) {
    return parseWindowAddLine(line, resolvers.resolveWindow);
  }
  if (line.startsWith('%window-close ')) {
    return parseWindowCloseLine(line, resolvers.resolveWindow);
  }
  // %begin / %end / %session-changed / %exit — control flow, not output frames.
  return { kind: 'unknown', raw: line };
}

// ── individual line parsers ───────────────────────────────────────────────────

/**
 * Decode tmux control-mode `%output` octal escapes back into raw bytes.
 *
 * tmux -CC encodes any non-printable / unsafe byte in `%output` data as a
 * backslash followed by EXACTLY three octal digits (e.g. ESC → `\033`, CR →
 * `\015`), and a literal backslash as `\\`. xterm.js does NOT understand that
 * encoding — it expects the actual control bytes — so forwarding the escaped
 * text verbatim makes ANSI sequences render as literal `\033[0m…` characters
 * (the blank/garbled-pane symptom). We must decode here, in the producer, so the
 * `%output` live path matches the already-decoded `capture-pane` snapshot path.
 */
function decodeTmuxOctal(s: string): string {
  if (!s.includes('\\')) return s; // fast path: nothing escaped
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const next = s[i + 1];
    if (ch === '\\' && next !== undefined) {
      // `\\` → a single literal backslash.
      if (next === '\\') {
        out += '\\';
        i += 1;
        continue;
      }
      // `\NNN` → the byte with that octal value (tmux always emits 3 digits).
      const d2 = s[i + 2];
      const d3 = s[i + 3];
      if (
        next >= '0' && next <= '7' &&
        d2 !== undefined && d2 >= '0' && d2 <= '7' &&
        d3 !== undefined && d3 >= '0' && d3 <= '7'
      ) {
        out += String.fromCharCode(parseInt(next + d2 + d3, 8));
        i += 3;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/**
 * %output %<pane-id> <data>
 *
 * The pane-id is a pane specifier ('%<N>'), NOT a window id. We resolve it via
 * the PANE resolver (paneId → windowId → terminalId in SessionService) — casting
 * it to a windowId and resolving against the window registry was the bug that
 * dropped EVERY output frame (pane '%3' never equals window '@3'). The data is
 * octal-decoded (decodeTmuxOctal) before forwarding so xterm receives real bytes.
 */
function parseOutputLine(line: string, resolvePane: PaneIdResolver): ParsedFrame {
  // Format: %output %<pane-id> <data...>
  // The pane-id token starts with %, e.g. %3
  const spaceAfterCmd = line.indexOf(' ', 8); // after '%output '
  if (spaceAfterCmd === -1) return { kind: 'unknown', raw: line };

  const paneId = line.slice(8, spaceAfterCmd); // e.g. '%3'
  const data = decodeTmuxOctal(line.slice(spaceAfterCmd + 1));

  const terminalId = resolvePane(paneId);
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
