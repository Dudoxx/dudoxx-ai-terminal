# ddx-term-web — CLAUDE.md (DOX local contract)

## Purpose
The human-facing UI for ddx-terminal-bridge: a Next.js 16 (App Router, React 19,
Tailwind v4, next-intl) app that renders the shared terminals with xterm.js. A
single page with a tab bar — one tab per `terminalId` — connected to the broker's
per-terminal WebSocket. Default port **13340** (`next dev --port 13340`).

## Ownership
- `src/app/[locale]/terminal/page.tsx` — §10 entity INDEX route: server
  component, redirects to `view/{most-recently-created}` or `list/grid` when
  none exist. No client state — selection lives in the URL (see Local Contracts).
- `src/app/[locale]/terminal/view/[terminalId]/{page,readonly/page,edit/page}.tsx`
  — §10 entity VIEW route family (thin server shells): derive `terminalId` from
  the async route param, mount `TerminalWorkspace` in `view`/`readonly`/`edit` mode.
- `src/app/[locale]/terminal/list/{grid,list,timeline}/page.tsx` — §10 entity
  LIST route family (thin server shells over `TerminalListView`).
- `src/app/[locale]/terminal/new/page.tsx` — §10 entity NEW route: create-then-
  redirect (no form fields beyond an auto title, same as the old +New button).
- `src/components/term/TerminalWorkspace.tsx` — the terminal session view
  (extracted from the old monolithic page.tsx): owns the `XtermClient`
  lifecycle, side panel, and status bar, keyed by a `terminalId` PROP (the
  route param) — never local `useState` selection. Selecting a different
  terminal calls `router.push('/{locale}/terminal/view/{id}')`.
- `src/components/term/TerminalListView.tsx` — grid/list/timeline presentations
  over the broker's terminal list; selection navigates to `view/{id}`.
- `src/components/term/TerminalBreadcrumb.tsx` — §13 breadcrumb primitive:
  reconstructible from the route the caller is rendering (root "Terminals" +
  caller-supplied trailing segments), not from client-side route inspection.
- `src/lib/term/xterm-client.ts` — the `XtermClient` wrapper (xterm + web-links
  addon, WS plumbing, `restoreSnapshot`, `applyAppearance` for live font/theme).
  Owns the buffer-until-painted guard (below) and consumes the broker's
  `snapshot` WS frame directly.
- `src/lib/term/appearance.ts` — color-theme registry (8 themes), font registry,
  font-size bounds, `TermAppearance` model. THE one place raw hex is allowed
  (xterm ITheme can't parse OKLCH — same exemption as the `--xterm-*-hex` vars
  had; that dead globals.css mirror block was removed).
- `src/lib/term/settings-store.ts` — localStorage-backed appearance store +
  `useTermAppearance` hook (useSyncExternalStore, cross-tab sync).
- `src/components/term/TerminalSidePanel.tsx` — collapsible left nav: session
  list + `AppearanceControls`. Accepts a `readonly` prop (hides new/rename/kill)
  for the `view/[terminalId]/readonly` route.
- `src/components/term/AppearanceControls.tsx` — font-size stepper, font + theme
  pickers (custom controls, no native `<select>`).
- `src/app/[locale]/layout.tsx` — app shell + Bricolage Grotesque display font
  (`next/font/google`, `--font-bricolage`). `globals.css` — Toucan Signal
  semantic tokens (terracotta `--color-primary`/`--color-accent`, cobalt
  `--color-link` aliased to `--color-ring`/`--color-info`).
- `src/i18n/{routing,request}.ts` — next-intl wiring (`[locale]` prefix).
- `messages/{en,de,fr}.json` — locale messages (lockstep; `terminal` namespace).
- `src/proxy.ts` — request proxy to the broker.
- `src/app/page.tsx` — root redirect using `getLocale()` (next-intl server) —
  NOT a hardcoded `/en` — to `/{locale}/terminal`.

## Local Contracts
- **`terminalId` selection is URL-addressable** (§10/§11/§12) — a route param
  (`view/[terminalId]`), never `useState`. Selecting a terminal is a
  `router.push`, not local state; a cold-load/refresh/shared-link always
  restores the terminal the URL names. An unknown `terminalId` renders a
  not-found state (`TerminalWorkspace`'s `notFound` guard), not a crash.
- **A breadcrumb must be reconstructible from the URL alone** (§13) —
  `TerminalBreadcrumb` renders purely from the segments the calling route
  supplies; it does not need to inspect `usePathname()` because every page
  already knows its own position in the entity tree.
- **One WebSocket per terminal**, scoped by `terminalId`. The client subscribes to
  `/term/<terminalId>` and receives only that terminal's frames.
- **Tab switch = WS resubscribe + snapshot, NOT a full reconnect**
  (RESPONSIVENESS §2.8): navigating to a new `view/{id}` (1) closes the old
  terminal's WS, (2) opens an `XtermClient` for the new `terminalId`, (3) fetches
  `GET /api/v1/terminals/:id/snapshot` and `restoreSnapshot()`s it to paint the
  current frame before live frames resume. Re-triggered by the route param
  changing (Next.js param-change effect), not by `setState`.
- **Buffer-until-painted (`XtermClient`, task_004)**: every attach/reconnect
  starts unpainted — live frames arriving before ANYTHING has painted are
  buffered FIFO, not written. The broker's `snapshot` WS frame (task_002) is
  consumed as the authoritative cold-attach repaint, routed through the same
  `restoreSnapshot()` path as the REST fallback; either one flips
  `painted=true` and flushes the buffer in order, whichever wins the race. A
  disposed client never paints or flushes.
- The visible grid must match what tmux/the agent see byte-for-byte — relies on
  the broker pinning session size (never let the client renegotiate dims).
- All frame/descriptor types from `@ddx/term-contract` — never redefine them.
  `TerminalDescriptor.windowId` is a branded STRING (tmux's internal `@N`
  handle) — never treat it as numeric/orderable; use `createdAt` (epoch ms) for
  any chronological sort (timeline view, "most recent" redirect target).
- Dudoxx frontend rules apply: semantic Tailwind v4 `@theme` tokens only (no raw
  palette classes), `h-dvh`/`min-h-0` scroll cascade, every user-facing string via
  next-intl `t()` in en/de/fr lockstep, `lucide-react` icons only. Zero `any`.
- A server component's `fetch()` (root `page.tsx`, index `terminal/page.tsx`)
  does NOT go through `next.config.ts`'s `rewrites()` — that only proxies
  client→Next HTTP requests. Server-side broker calls read `BROKER_BASE_URL`
  directly, same as `next.config.ts` itself does.

## Verification
`pnpm --filter ddx-term-web typecheck` · `pnpm --filter ddx-term-web lint` ·
`pnpm --filter ddx-term-web test` (vitest/jsdom). Manual: `pnpm --filter
ddx-term-web dev` → http://localhost:13340 with the broker (13330) running; switch
tabs and confirm snapshot paint + live frames per terminal.

---
Attribution: Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
