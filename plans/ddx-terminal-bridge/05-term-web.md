# Shard 05 — ddx-term-web (Group C)

**Task id:** `C1` · **Agent:** stack-specialist · **Skills:** create-nextjs, frontend-stack, typescript-strict
**Parallel?** No within group (single task); depends on Group B contracts (WS frames + REST).

## Why this shard
The human render leg: a Next.js 16 page with an xterm.js terminal, terminal TABS (switch among the N
terminals by `terminalId`), and snapshot fetch. Each xterm instance subscribes to ONE `/term/:terminalId`
WS stream and consumes the control-mode frames the broker emits; keystrokes flow back as `input` frames
(ARCHITECTURE §5 Flow A, §9 step 5).

## Mirror (Pattern Basis)
`dudoxx-ai-hms/ddx-web/` — Next 16 app shell skeleton. Use the **create-nextjs** skill for the day-zero
project. **Scope note (In-Session):** this is a CLI/terminal UI — the Dudoxx Design System
entity-route/header-footer machinery is mostly N/A. Build a SINGLE terminal page
(`src/app/[locale]/terminal/page.tsx`) with xterm.js + tabs. Use semantic OKLCH tokens for the chrome
(bg-background/text-foreground), but do NOT force the full `/{entity}/view/[id]/...` entity pattern.

## Client design
- `src/lib/term/xterm-client.ts` — connects WS `/term/:terminalId`, applies frames to an `xterm.js`
  Terminal (webgl + fit addons), sends `onData(key)` as `input` frames. Imports frame types from
  `@ddx/term-contract` (no local frame shapes).
- Terminal tabs — list from `GET /terminals`; clicking a tab = WS resubscribe + one `GET
  /terminals/:id/snapshot` to paint the current frame (RESPONSIVENESS §2.8, not a full reconnect). Each
  tab shows per-terminal status (command / pid) from `term_list` mirror.
- Reconnect restores live + scrollback (broker re-attaches; tmux survives disconnect).

## Boundaries
- Render only — no tmux logic, no MCP, no PTY. All terminal control goes through the broker WS/REST.
- i18n/Tailwind drift contract (Cardinal #23): any user-facing chrome string via `t()`, en/de/fr
  lockstep; semantic tokens only (no raw palette utilities).

## Verification
`src/lib/term/xterm-client.spec.ts` (frame→terminal write, keystroke→input frame, tab resubscribe).
`pnpm -F ddx-term-web build && test`; `tsc --noEmit` clean. See tasks.json `C1`.
