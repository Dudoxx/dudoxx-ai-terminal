# 00 — Job: Terminal UI Refactor + Stack Robustness Pass

## Problem statement (numbered symptoms → WS refs)

1. **Terminal selection is not URL-addressable.** `ddx-term-web/src/app/[locale]/terminal/page.tsx:77`
   holds the active terminal in `useState<string|null>`, seeded from the first descriptor in the
   broker list (`:118-120`). A refresh, a shared link, or a new tab always lands on "whatever sorts
   first" — never the terminal the user was viewing. No `[terminalId]` route segment exists. → **WS1**
2. **Root redirect is hardcoded + target-less.** `ddx-term-web/src/app/page.tsx:12` unconditionally
   redirects to `/en/terminal`, bypassing next-intl locale negotiation and carrying no terminal
   target. → **WS1**
3. **Design tokens have drifted from Toucan Signal.** `globals.css:31-37,51` splits `--color-primary`
   (navy) from `--color-accent` (terracotta) instead of the D-014 contract `--color-primary =
   --color-accent = ONE terracotta`; no cobalt `--color-link` axis; no Bricolage display face
   (`--font-sans` Inter + `--font-mono` JetBrains Mono only); a dead `--xterm-*-hex` mirror block
   (`:64-67`) orphaned since the `appearance.ts` registry landed. → **WS2**
4. **Snapshot-vs-live-frame race on the web side.** `xterm-client.ts` `connect()` resolves before
   the socket is open, so live `ws.onmessage` frames can interleave with the `restoreSnapshot` write
   (`page.tsx:155-157`) — output can paint out of order on (re)attach. → **WS3**
5. **Broker pushes no initial state on WS attach.** `ddx-term-broker/src/term.gateway.ts:168-196`
   `handleConnection` is a pure live-tail — a fresh WS open to `/term/<id>` shows a BLANK terminal
   until the next tmux event. The frontend must orchestrate `GET /:id/snapshot` → open WS itself,
   with a race in the gap (broker defect #3). → **WS3 / WS4**
6. **Broker snapshot is viewport-only.** `terminal.service.ts:124-168` uses `capture-pane -e -p`
   with no `-S` — a cold URL load loses everything above the visible 30-row viewport. No scrollback
   endpoint exists. → **WS4** (decision-gated)
7. **MCP server robustness gaps (no CRITICAL).** `tmux.client.ts:279-282,331-333` swallow ALL exec
   errors into `[]` (masks real faults as "no processes"); `newSession` (`:110-138`) duplicates the
   error-wrap block; `term-wait-for.tool.ts` never resets the read-cursor (inconsistent with
   `term_snapshot`); `term-ps.tool.ts:21` uses depth-1 child walk vs `term-signal`'s full-tree walk.
   NO-PTY invariant is INTACT; the 3 prod-launch bugs (0.2.2) are confirmed still fixed. → **WS5**

## Reformulated needs (phases)

- **Phase A — Frontend correctness (WS1):** make the URL the source of truth for which terminal
  renders. New `app/[locale]/terminal/[terminalId]/page.tsx` segment; `activeId` derived from
  `useParams()`; tab-click = `router.push` (shallow, no reload); index route redirects to
  first/most-recent descriptor or renders empty state; `notFound()` path for a killed/unknown id;
  locale-aware root redirect.
- **Phase B — Frontend design compliance (WS2):** bring `globals.css` + terminal components to
  Toucan Signal — unify primary=accent terracotta, add cobalt link/ring axis, add Bricolage display
  face, delete dead xterm-hex mirror, replace `as never` i18n escapes with typed keys. Preserve the
  `appearance.ts` raw-hex exemption (xterm ITheme cannot parse OKLCH).
- **Phase C — Redraw/restore robustness (WS3 + WS4):** fix the snapshot-vs-live-frame race on BOTH
  sides (buffer live frames until snapshot painted); add broker restore-on-attach so a cold WS open
  repaints without a separate REST round-trip; decide scrollback depth.
- **Phase D — MCP + broker hardening (WS5):** un-swallow exec errors, resolve the wait_for/cursor +
  ps/signal-depth design questions, DRY the tmux client. No restructuring — the MCP server is healthy.

## Expected outcomes

- Every terminal is a deep-linkable URL: `/{locale}/terminal/{terminalId}` renders THAT terminal's
  output on cold load / refresh / shared link.
- `ddx-term-web` passes the Dudoxx design-system §25 audit grid (semantic tokens, Toucan Signal
  palette, three-face type, no gradients/borders).
- Snapshot restore is deterministic — no interleaved/out-of-order paint on (re)attach.
- MCP server + broker are hardened (no silent error-swallowing; consistent verb contracts) with the
  NO-PTY invariant and contract-alignment invariants preserved.
- `pnpm typecheck && pnpm lint && pnpm test` green across all packages; zero `any`.

## Constraints

Binding repo invariants — the cascade floor:

- **The MCP server NEVER holds a PTY** — shells out to `tmux` only (`no-pty.spec.ts` guards it).
- **`terminalId` = stable address; `pid` = transient signal target.** Never conflate.
- **All cross-boundary types come from `@ddx/term-contract`** — never redefine a frame/descriptor.
- **Broker pins session size (120×30)** and owns canonical dims — no client renegotiation.
- **Zero `any`** across all TypeScript; strict everywhere.
- **Dudoxx frontend rules** (`ddx-term-web/CLAUDE.md` + path-scoped `dudoxx-design-system.md`):
  semantic `@theme` tokens only, next-intl `t()` in en/de/fr lockstep, lucide-react icons only,
  `h-dvh`/`min-h-0` scroll cascade, no toasts/side-sheets/native dialogs.

## ASSUMPTIONS (reformulated, not extrapolated — operator may redline)

1. "Full refactor of the MCP server" means **hardening + design-decision resolution**, NOT
   restructuring — the audit found no CRITICAL/HIGH there and the architecture is sound. If the
   operator wants a structural rewrite, that is a different, larger job.
2. ~~Full scrollback restore is OUT~~ → **OVERRIDDEN (D1=YES, 2026-07-14)**: full bounded scrollback
   restore on deep-link is IN SCOPE. WS4 adds a bounded `capture-pane -S -<n>` variant; a cold
   deep-link repaints history above the viewport (still bounded — never unbounded).
3. ~~Flat URL shape~~ → **OVERRIDDEN (D2=YES, 2026-07-14)**: the full design-system §10 entity grammar
   IS adopted (`/terminal/list/{grid,list,timeline}`, `/terminal/view/[id]/{edit,readonly}`, `/terminal/new`)
   with breadcrumbs + URL-persistent state (§11–§13). Excludes only the sub-entity/export/print §10
   branches (N/A for terminals). WS1 is correspondingly larger.
4. e2e/CLI fixtures (`ddx-cli-py`, `ddx-cli-ts`) are targets, not refactor scope.
