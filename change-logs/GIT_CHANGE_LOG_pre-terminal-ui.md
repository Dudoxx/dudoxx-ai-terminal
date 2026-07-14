# Change Log — main @ terminal-ui-refactor
**Date**: 2026-07-14  |  **Projects**: ddx-term-web, ddx-term-broker, ddx-term-mcp, @ddx/term-contract

## Summary
URL-based §10 terminal routing (deep-link/refresh-safe rendering), Toucan Signal design
tokens, broker restore-on-attach + bounded scrollback, xterm buffer-until-painted guard, and
MCP tmux-client hardening. Delivered via team-execute (3 term specialists), code+security
reviewed, reconciled, and browser-verified (deep-link restore, not-found, §10 list, byte-fidelity).

## Files Changed
 ddx-term-mcp/src/tmux/tmux.client.ts               |  81 +++--
 ddx-term-mcp/src/tools/term-ps.tool.ts             |   8 +-
 ddx-term-mcp/src/tools/term-wait-for.tool.ts       |   6 +
 ddx-term-web/CLAUDE.md                             |  68 +++-
 ddx-term-web/messages/de.json                      |  17 +-
 ddx-term-web/messages/en.json                      |  17 +-
 ddx-term-web/messages/fr.json                      |  17 +-
 ddx-term-web/next-env.d.ts                         |   2 +-
 ddx-term-web/src/app/[locale]/layout.tsx           |  13 +-
 ddx-term-web/src/app/[locale]/terminal/page.tsx    | 355 +++------------------
 ddx-term-web/src/app/globals.css                   |  33 +-
 ddx-term-web/src/app/page.tsx                      |  16 +-
 .../src/components/term/AppearanceControls.tsx     |  32 +-
 .../src/components/term/TerminalSidePanel.tsx      |  61 ++--
 ddx-term-web/src/lib/term/xterm-client.spec.ts     |  88 ++++-
 ddx-term-web/src/lib/term/xterm-client.ts          |  94 ++++++
 handoffs/HANDOFF_LATEST                            |   2 +-
 packages/ddx-term-contract/src/ws-frames.spec.ts   |  39 +++
 packages/ddx-term-contract/src/ws-frames.ts        |  33 ++
 24 files changed, 837 insertions(+), 433 deletions(-)

## Build & Lint
- full stack: pnpm typecheck 5/5 clean, pnpm lint 5/5 clean, tests web8/contract24/mcp72/broker51.

## Commit
[filled after commit]
