/**
 * @ddx/term-contract — public surface.
 *
 * Single source of truth for every shared shape in the ddx-terminal-bridge:
 * terminal/process descriptors, session descriptors + policy enums, the
 * control-mode → WebSocket frame discriminated union, and the MCP tool
 * input/output schemas. The broker (NestJS), the MCP server (stdio), and the
 * web client (Next.js + xterm.js) ALL import from here — types are NEVER
 * duplicated downstream (plans/ddx-terminal-bridge/_invariants.md).
 *
 * Pure types + zod only. No runtime tmux / Nest / React code, no node-pty.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

export * from './terminal';
export * from './session';
export * from './ws-frames';
export * from './mcp-tools';
