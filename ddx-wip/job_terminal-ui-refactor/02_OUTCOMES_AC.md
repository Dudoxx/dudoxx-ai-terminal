# 02 — Outcomes & Acceptance Criteria

Every AC carries a backtick-quoted mechanical check. Run from repo root unless noted.
Browser checks assume broker (13330) + web (13340) running (operator-started — Cardinal #4).

## WS1 — URL-based terminalId routing

- [ ] AC1.1 §10 view route segment exists:
  `test -f 'ddx-term-web/src/app/[locale]/terminal/view/[terminalId]/page.tsx'`
- [ ] AC1.2 Active terminal derives from route params, not local selection state:
  `rg -n 'useParams|await params' 'ddx-term-web/src/app/[locale]/terminal/view/[terminalId]/page.tsx'` returns ≥1 hit
  AND `rg -n "useState.*activeId|const \[activeId" 'ddx-term-web/src/app/[locale]/terminal/view/[terminalId]/page.tsx'` returns 0 hits.
- [ ] AC1.3 Selection navigates the URL (no setState-only selection):
  `rg -n 'router\.push' ddx-term-web/src/components/term/ 'ddx-term-web/src/app/[locale]/terminal/'` returns ≥1 hit.
- [ ] AC1.4 §10 list views exist (grid/list/timeline):
  `test -d 'ddx-term-web/src/app/[locale]/terminal/list/grid' && test -d 'ddx-term-web/src/app/[locale]/terminal/list/list' && test -d 'ddx-term-web/src/app/[locale]/terminal/list/timeline'`
- [ ] AC1.4b Index route redirects/empty-states (no first-descriptor auto-pick as the only path):
  `rg -n 'redirect|notFound|empty' 'ddx-term-web/src/app/[locale]/terminal/page.tsx'` returns ≥1 hit.
- [ ] AC1.4c Breadcrumb reconstructible from URL alone (§13):
  `rg -n -i 'breadcrumb' 'ddx-term-web/src/app/[locale]/terminal/'` returns ≥1 hit.
- [ ] AC1.5 Root redirect is locale-aware (no hardcoded `/en`):
  `rg -n "'/en/terminal'|\"/en/terminal\"" ddx-term-web/src/app/page.tsx` returns 0 hits.
- [ ] AC1.6 Deep-link restore works in-browser: navigate directly to `/{locale}/terminal/view/{existing-id}`
  on a fresh tab → the correct terminal's output paints (not the first-sorted one).
  `browser-loop assertion: cold-load /en/terminal/view/<id> shows that terminal's last output`
- [ ] AC1.7 Unknown id → not-found, not a crash: navigate to `/{locale}/terminal/view/does-not-exist` →
  renders the not-found path. `browser-loop assertion: 404/empty state, no unhandled error in console`

## WS2 — Toucan Signal design compliance

- [ ] AC2.1 primary = accent = one terracotta hue:
  `` check `--color-primary` and `--color-accent` in ddx-term-web/src/app/globals.css resolve to the same terracotta OKLCH `` (manual diff of the two token lines; hues within ±2).
- [ ] AC2.2 Cobalt link axis present:
  `rg -n -- '--color-link' ddx-term-web/src/app/globals.css` returns ≥1 hit.
- [ ] AC2.3 Bricolage display face declared:
  `rg -n 'Bricolage' ddx-term-web/src/app/globals.css ddx-term-web/src/app/[locale]/layout.tsx` returns ≥1 hit.
- [ ] AC2.4 Dead xterm-hex mirror removed:
  `rg -n -- '--xterm-.*-hex' ddx-term-web/src/app/globals.css` returns 0 hits.
- [ ] AC2.5 No `as never` i18n escapes:
  `rg -n 'as never' ddx-term-web/src/components/term/` returns 0 hits.
- [ ] AC2.6 No raw palette utilities / gradients / container borders (design-system §25):
  `rg -n 'bg-(red|blue|green|slate|gray|zinc)-[0-9]|gradient|border-(top|bottom|left|right): [0-9]' ddx-term-web/src` returns 0 hits (excluding appearance.ts).
- [ ] AC2.7 Renders correct in light AND dark: `browser-loop assertion: toggle theme, no unstyled/contrast-fail surface`.

## WS3 — Snapshot/live-frame ordering

- [ ] AC3.1 Live frames are buffered until snapshot painted:
  `rg -n 'buffer|pending|queue' ddx-term-web/src/lib/term/xterm-client.ts` returns ≥1 hit in the WS/snapshot path.
- [ ] AC3.2 Existing xterm-client tests still green + a new ordering test exists:
  `pnpm --filter ddx-term-web test` exits 0 AND `rg -n 'snapshot.*(before|order|buffer)|race' ddx-term-web/src/lib/term/xterm-client.spec.ts` returns ≥1 hit.
- [ ] AC3.3 No out-of-order paint on rapid tab switch: `browser-loop assertion: switch tabs 5× fast, each shows its own correct last output`.

## WS4 — Broker restore-on-attach

- [ ] AC4.1 WS attach pushes initial state (no blank-until-next-event):
  `rg -n 'snapshot|initial|capturePane' ddx-term-broker/src/term.gateway.ts` returns ≥1 hit in `handleConnection`.
- [ ] AC4.2 Cold WS open repaints without a separate REST call: `browser-loop assertion: open a terminal WS,
  first frame received is the current screen state` (verify via network panel: no /snapshot REST needed, or REST is redundant).
- [ ] AC4.3 [D1=YES — ACTIVE] Bounded `-S` scrollback variant exists and is bounded:
  `rg -n 'capture-pane.*-S|SCROLLBACK' ddx-term-broker/src/terminal.service.ts` returns a hit WITH a named numeric bound (never bare `-S`).
- [ ] AC4.3b Deep-link restores scrollback above the viewport in-browser:
  `browser-loop assertion: cold-load a terminal with >30 rows of prior output → history above the visible screen is present after restore`.
- [ ] AC4.4 Dims invariant untouched: `rg -n '120|SESSION_COLS' ddx-term-broker/src/session.service.ts` still shows 120×30 pinning.

## WS5 — MCP + broker hardening

- [ ] AC5.1 Exec errors no longer swallowed wholesale:
  `rg -n 'err.code === 1|code !== 1|ENOENT' ddx-term-mcp/src/tmux/tmux.client.ts` returns ≥1 hit (distinguishes no-match from fault).
- [ ] AC5.2 newSession error-wrap de-duplicated:
  `` a shared wrap helper is referenced in `newSession` (manual read: no copy-pasted try/catch TmuxExecError block) ``.
- [ ] AC5.3 wait_for/cursor behavior resolved: either a cursor reset is added OR an inline doc comment
  explains the intentional non-reset: `rg -n 'cursor|resetCursor|intentional' ddx-term-mcp/src/tools/term-wait-for.tool.ts` returns ≥1 hit.
- [ ] AC5.4 [D4=ALIGN] term_ps processes[] walks the full tree: `rg -n 'descendantPids' ddx-term-mcp/src/tools/term-ps.tool.ts` returns ≥1 hit AND `rg -n 'childPids' ddx-term-mcp/src/tools/term-ps.tool.ts` no longer drives `processes[]` (fgPid may still use it). A spec asserts grandchildren appear in `processes[]`.
- [ ] AC5.5 NO-PTY invariant still guarded: `pnpm --filter @dudoxx/ddx-term-mcp test` runs `no-pty.spec.ts` green.

## Job-level gates

- [ ] ACJ.1** Full stack typechecks: `pnpm typecheck` exits 0.
- [ ] ACJ.2** Full stack lints: `pnpm lint` exits 0.
- [ ] ACJ.3** Full test suite green: `pnpm test` exits 0.
- [ ] ACJ.4** Zero `any` introduced: `rg -n ': any|as any' ddx-term-web/src ddx-term-broker/src ddx-term-mcp/src` count does not increase vs baseline (baseline = 0 per invariant).
- [ ] ACJ.5** Contract-sourced types preserved: `rg -n "from '@ddx/term-contract'" ddx-term-broker/src ddx-term-mcp/src ddx-term-web/src` still resolves all frame/descriptor imports (no local redefinition introduced).
- [ ] ACJ.6** DOX pass done: root + each touched package `CLAUDE.md` updated where purpose/contract/ownership changed; `git diff --name-only` includes the relevant `CLAUDE.md` files if contracts changed.
- [ ] ACJ.7** `code-reviewer` (all touched code) + `security-reviewer` (WS1/WS4 touch WS endpoints) run clean or with findings resolved.
