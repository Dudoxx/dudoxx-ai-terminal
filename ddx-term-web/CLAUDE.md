# ddx-term-web — CLAUDE.md (DOX local contract)

## Purpose
The human-facing UI for ddx-terminal-bridge: a Next.js 16 (App Router, React 19,
Tailwind v4, next-intl) app that renders the shared terminals with xterm.js. A
single page with a tab bar — one tab per `terminalId` — connected to the broker's
per-terminal WebSocket. Default port **13340** (`next dev --port 13340`).

## Ownership
- `src/app/[locale]/terminal/page.tsx` — the terminal page: 3-zone shell
  (collapsible side panel | status bar + active xterm view). Owns session
  selection, live-appearance application, and collapsed-state persistence.
- `src/lib/term/xterm-client.ts` — the `XtermClient` wrapper (xterm + web-links
  addon, WS plumbing, `restoreSnapshot`, `applyAppearance` for live font/theme).
- `src/lib/term/appearance.ts` — color-theme registry (8 themes), font registry,
  font-size bounds, `TermAppearance` model. THE one place raw hex is allowed
  (xterm ITheme can't parse OKLCH — same exemption as the `--xterm-*-hex` vars).
- `src/lib/term/settings-store.ts` — localStorage-backed appearance store +
  `useTermAppearance` hook (useSyncExternalStore, cross-tab sync).
- `src/components/term/TerminalSidePanel.tsx` — collapsible left nav: session
  list + `AppearanceControls`.
- `src/components/term/AppearanceControls.tsx` — font-size stepper, font + theme
  pickers (custom controls, no native `<select>`).
- `src/app/[locale]/layout.tsx`, `globals.css` — app shell + theme tokens.
- `src/i18n/{routing,request}.ts` — next-intl wiring (`[locale]` prefix).
- `messages/{en,de,fr}.json` — locale messages (lockstep; `terminal` namespace).
- `src/proxy.ts` — request proxy to the broker.

## Local Contracts
- **One WebSocket per terminal**, scoped by `terminalId`. The client subscribes to
  `/term/<terminalId>` and receives only that terminal's frames.
- **Tab switch = WS resubscribe + snapshot, NOT a full reconnect**
  (RESPONSIVENESS §2.8): clicking a tab (1) closes the old terminal's WS, (2)
  opens an `XtermClient` for the new `terminalId`, (3) fetches
  `GET /api/v1/terminals/:id/snapshot` and `restoreSnapshot()`s it to paint the
  current frame before live frames resume.
- The visible grid must match what tmux/the agent see byte-for-byte — relies on
  the broker pinning session size (never let the client renegotiate dims).
- All frame/descriptor types from `@ddx/term-contract` — never redefine them.
- Dudoxx frontend rules apply: semantic Tailwind v4 `@theme` tokens only (no raw
  palette classes), `h-dvh`/`min-h-0` scroll cascade, every user-facing string via
  next-intl `t()` in en/de/fr lockstep, `lucide-react` icons only. Zero `any`.

## Verification
`pnpm --filter ddx-term-web typecheck` · `pnpm --filter ddx-term-web lint` ·
`pnpm --filter ddx-term-web test` (vitest/jsdom). Manual: `pnpm --filter
ddx-term-web dev` → http://localhost:13340 with the broker (13330) running; switch
tabs and confirm snapshot paint + live frames per terminal.

---
Attribution: Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
