# 01 — Scope: Workstreams

Five workstreams. WS1–WS3 are the frontend spine (the operator's primary ask); WS4 is broker
restore-support (partly decision-gated); WS5 is MCP+broker hardening. Owner-agent suggestions are
the DDX term specialists.

---

## WS1 — URL-based terminal routing, full §10 entity grammar (CRITICAL) — D2=YES
**Goal**: The URL is the single source of truth for which terminal renders AND the terminal resource
follows the design-system §10 entity-routing grammar. Deep-link, refresh, and shared links all
restore the intended terminal's output; list/grid/timeline views + view/edit/readonly modes exist.
**Surface** (D2 resolved → FULL §10 grammar, not the flat shape):
- NEW route family under `ddx-term-web/src/app/[locale]/terminal/`:
  - `view/[terminalId]/page.tsx` — reads `terminalId` from `await params`, derives active client from
    route param (not `useState`); modes `view/[terminalId]/readonly` + `view/[terminalId]/edit` (rename).
  - `list/{grid,list,timeline}/page.tsx` — terminal-list views (grid = cards, list = rows, timeline =
    activity). `new/page.tsx` — create flow (or redirect-create).
  - index `terminal/page.tsx` → redirect to `list/grid` (or most-recent `view/[id]`), empty-state when none.
- `ddx-term-web/src/app/page.tsx:12` — locale-aware root redirect (drop hardcoded `/en`).
- Selection navigates via `router.push('/{locale}/terminal/view/{id}')` (shallow, no reload).
- Breadcrumb stack reconstructible from URL alone (§13); URL-persistent view-mode/selection (§11–§12).
- `notFound()` when the URL terminalId no longer exists (polled list can lose it).
- Preserve `dispose→new XtermClient→snapshot` — re-triggered by param change, not setState.
**Owner**: `ddx-term-web-specialist` (+ `ddx-nextjs-navigation` skill for §10–§13 grammar/breadcrumbs)
**NOT**: NOT the full CRUD sub-entity/export/print tail of §10 (`/subentity/...`, `/export/...`,
`/print/...`) — terminals have no sub-entities or export formats; those §10 branches are N/A and
explicitly excluded. NOT changing the broker CRUD API (it already supports get-by-id + list + snapshot).
NOT persisting terminal state to a DB (terminals are live tmux resources, not stored records).

---

## WS2 — Dudoxx Toucan Signal design compliance (HIGH)
**Goal**: `ddx-term-web` conforms to the D-014 Toucan Signal system and passes the design-system §25
audit grid.
**Surface**:
- `globals.css:31-37,51` — unify `--color-primary` = `--color-accent` = ONE terracotta; add cobalt
  `--color-link` (= `--color-ring` / `--color-info`) axis; keep green = success-only.
- `globals.css` — add Bricolage Grotesque display face (`--font-display`) via `next/font/google`;
  keep Inter (UI/body) + JetBrains Mono (terminal data).
- `globals.css:64-67` — DELETE the dead `--xterm-*-hex` mirror block (orphaned by `appearance.ts`).
- `AppearanceControls.tsx:94,138` — replace `t(\`...\` as never)` with typed keyof-union keys.
- Verify no gradients, no container borders (shadow-elev-N only), semantic tokens throughout, in
  BOTH light + dark.
**Owner**: `ddx-term-web-specialist` (+ `stack-specialist` for token audit)
**NOT**: NOT touching `appearance.ts` raw-hex values — that is the ONE sanctioned xterm ITheme
exemption (OKLCH unparseable by xterm). NOT restyling the xterm canvas colors themselves (theme
registry is user-configurable by design). NOT a full marketing-surface rebrand — product UI only.

---

## WS3 — Snapshot/live-frame ordering guard (MED, both sides)
**Goal**: Terminal output paints deterministically on (re)attach — no interleaving of the restored
snapshot with live frames.
**Surface**:
- `xterm-client.ts` — buffer incoming live WS frames until the snapshot has been written, then flush
  in order. Sequence: open WS (buffering) → fetch snapshot → write snapshot → flush buffer → go live.
- Align `page.tsx` `switchTo` ordering with the new buffering contract (currently
  connect→snapshot→restore at `:155-157`).
- Guard against a stale client's `onReconnect` firing after `dispose()` (the `this.disposed` net
  exists — verify it covers the buffered-flush path too).
**Owner**: `ddx-term-web-specialist`
**NOT**: NOT rewriting the reconnect-backoff logic (it is solid — jittered exponential, capped at 60).
NOT changing the WS frame schema in `@ddx/term-contract`.

---

## WS4 — Broker restore-on-attach (HIGH) + scrollback decision (decision-gated)
**Goal**: A cold WS open to `/term/<id>` repaints the current terminal state without the frontend
needing a separate REST snapshot round-trip (closes the broker snapshot/subscribe race).
**Surface**:
- `ddx-term-broker/src/term.gateway.ts:168-196` `handleConnection` — on subscribe, push an initial
  snapshot frame (viewport capture) before/atomically-with going live, eliminating the REST→WS gap
  (broker defect #1 + #3).
- **D1 resolved → YES, full scrollback**: `terminal.service.ts:124-168` gets a bounded
  `capture-pane -S -<n>` variant as a SEPARATE method (never unbounded; respects FM#3 "never return
  unbounded scrollback"). Bound `<n>` = a named constant (e.g. `SCROLLBACK_LINES`, default ≤ tmux
  history-limit). The restore-on-attach frame (above) carries this bounded scrollback, so a cold
  deep-link repaints history above the viewport, not just the visible 30 rows.
- New scrollback frame type (if the WS frame shape needs it) lands in `@ddx/term-contract` FIRST.
**Owner**: `ddx-term-broker-specialist`
**NOT**: NOT changing dims pinning (120×30 is a hard invariant, verified solid). NOT touching
`reconcileRegistry` (solid, restart-survival works). NOT unbounded scrollback under any option.

---

## WS5 — MCP server + broker hardening (MED/LOW — no restructure)
**Goal**: Remove silent-failure and contract-inconsistency footguns without restructuring the
healthy MCP architecture.
**Surface**:
- `ddx-term-mcp/src/tmux/tmux.client.ts:279-282,331-333` — un-swallow exec errors: distinguish
  `pgrep` exit-1 (no match, expected) from genuine faults (surface as `TmuxExecError`).
- `tmux.client.ts:110-138` `newSession` — extract the duplicated `TmuxExecError`-wrap into a shared
  helper (keep the global-flag-precedes-`-S` constraint).
- `term-wait-for.tool.ts` — DECISION + implement: reset read-cursor to tail on match (consistent with
  `term_snapshot`) OR document the intentional non-reset. Recommend: document non-reset (the "see
  everything since I started waiting" UX is desirable — audit softened this to a doc gap).
- `term-ps.tool.ts:21` (D4 resolved → ALIGN): switch from depth-1 `childPids` to full
  `descendantPids` so `processes[]` lists grandchildren, matching `term-signal`'s tree boundary. Keep
  `fgPid` as the direct foreground child (that field's meaning is unchanged); it's the `processes[]`
  list that goes full-tree. Update/add a spec asserting grandchildren appear.
**Owner**: `ddx-term-mcp-specialist`
**NOT**: NOT touching the NO-PTY invariant surface (intact — `execFile` tmux/ps/pgrep/kill only).
NOT re-reporting the 3 prod-launch bugs (confirmed fixed at 0.2.3). NOT restructuring the resolver/
registry/dispatch (exhaustive-switch + contract-sourced schemas are correct). NOT a supervisor-internals
deep audit (deferred — re-dispatch separately if wanted).

---

## Cross-WS boundary rules
- WS1 depends on WS3's buffering contract for correct restore, but can land first with the existing
  connect→snapshot sequence; WS3 hardens it. Sequence WS1 → WS3, or land together.
- WS4's restore-on-attach lets WS3 drop the separate REST snapshot fetch — but only if WS4 ships.
  If WS4 scrollback is deferred, WS3 keeps the REST-snapshot path with the buffering guard.
- `@ddx/term-contract` changes (if any) are a shared dependency — build order contract → broker/mcp/web
  (turbo DAG). Any new frame type lands in the contract package FIRST.
- Every WS ends with the DOX pass on the closest owning `CLAUDE.md` (root + package-local).
