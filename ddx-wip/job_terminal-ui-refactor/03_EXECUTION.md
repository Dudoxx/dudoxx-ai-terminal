# 03 — Execution Mapping

## Engine selection

**Primary lane: `plan-feature-loop` (+ `browser-loop` verify).**

Rationale (Cardinal #18 — one path): this is **runtime-heavy UI work where compile-green ≠ working.**
The CRITICAL defect (URL routing) and the redraw/restore robustness ACs (AC1.6, AC1.7, AC2.7, AC3.3,
AC4.2) can only be confirmed by driving a real browser against the live broker+web stack — a
typecheck/lint pass says nothing about whether a deep-linked terminal actually repaints. The
plan-feature-loop engine browser-verifies each shard; the backend-only hardening shards (WS5, parts
of WS4) fall back to unit-test + typecheck gates within the same loop.

| Lane | Workstreams | Progress surface |
|---|---|---|
| **`plan-feature-loop` (primary)** | WS1, WS2, WS3, WS4 (frontend-observable) | per-shard browser evidence + shard commits + `plans/{scope}/tasks/` statuses |
| **`/execute` unit-gate (secondary)** | WS5, WS4 broker internals | `plans/{scope}/progress/{id}.md` + `pnpm test` per shard |
| **`code-reviewer` + `security-reviewer` (gate)** | all | findings resolved before EXECUTED (ACJ.7) |

Monitor: `/workflows`-style shard board is N/A here; the loop driver's per-shard commits +
`04_PROGRESS.md` roll-up + `plans/{scope}/tasks/` are the monitoring surfaces.

## Pipeline

```
/plan-feature --job ddx-wip/job_terminal-ui-refactor
  → plan writes plans/terminal-ui-refactor/ (WS NOT lists → Boundaries; ACs → AC matrix)
  → plan-feature-loop drives shards (browser-verify frontend; unit-gate backend)
  → per-shard: code-reviewer; WS1+WS4 shards also security-reviewer (WS endpoints)
  → ACJ gates (typecheck/lint/test/zero-any/DOX)
  → /unify → SUMMARY.md → README Status RECONCILED
```

## Wave order

| Wave | WS | Depends on | Gate |
|---|---|---|---|
| 1 | WS4 broker restore-on-attach + bounded scrollback (D1) + contract frame | — (contract builds first) | AC4.1–AC4.4 + `pnpm --filter ddx-term-broker test` |
| 2 | WS1 §10 entity routing (D2 — LARGER: view/list/new + breadcrumbs) | broker CRUD (exists), WS4 scrollback frame | AC1.1–AC1.7 (browser) |
| 3 | WS3 snapshot/live-frame guard | WS1 (route), WS4 (attach frame) | AC3.1–AC3.3 (browser) |
| 4 | WS2 design tokens | — (parallel-safe with 1–3) | AC2.1–AC2.7 (browser light+dark) |
| 5 | WS5 MCP+broker hardening | — (independent) | AC5.1–AC5.5 (unit) |

WS2 and WS5 are independent and can run parallel to the WS4→WS1→WS3 chain.

## Failure modes (three concrete, each resolved into an AC)

1. **FM1 — "URL route added but selection still driven by useState."** A partial refactor leaves the
   new `[terminalId]` segment mounted while `activeId` state still shadows it, so the URL changes but
   the wrong terminal renders (or double-mounts two XtermClients → duplicate WS, doubled output).
   → **Resolved by AC1.2** (params-derived, zero `useState.*activeId`) **+ AC3.3** (rapid-switch shows
   each terminal's OWN output — catches double-mount) **+ security-reviewer** on the WS attach path
   (a stale second client sending to the wrong terminalId is the broker's 1008-close case).
2. **FM2 — "Snapshot race regresses under the new route-driven mount."** Moving from setState to
   route-param mount changes WHEN `connect()`/`fetchSnapshot` fire; if the buffering guard isn't in
   place, a fast broker paints live frames before the snapshot → garbled scrollback on every
   deep-link. → **Resolved by AC3.1** (buffer-until-painted) **+ AC3.2** (ordering test) **+ AC4.2**
   (restore-on-attach makes the first frame authoritative, shrinking the race window).
3. **FM3 — "Design-token unification breaks the xterm theme."** Editing `globals.css` primary/accent
   while the xterm canvas reads `appearance.ts` — if someone "helpfully" rewires the xterm theme to
   the new tokens, xterm's ITheme chokes on OKLCH (it can't parse it) → blank/black terminal canvas.
   → **Resolved by AC2.4** (only the DEAD mirror is removed) **+ the WS2 NOT line** (appearance.ts
   raw-hex untouched) **+ AC2.7** (browser check catches a blank canvas immediately).

## Agent / skill routing

- WS1, WS2, WS3 → `ddx-term-web-specialist` (Next.js 16 + xterm owner); WS2 token audit assist from
  `stack-specialist` / `dudoxx-branding` + path-scoped `dudoxx-design-system.md`.
- WS4 → `ddx-term-broker-specialist` (NestJS 11 + tmux control-mode owner).
- WS5 → `ddx-term-mcp-specialist` (MCP stdio + thin tmux client owner).
- Gates → `code-reviewer` (all), `security-reviewer` (WS1/WS4 — WS endpoints + cross-tab input isolation).
- Any new `@ddx/term-contract` frame → contract package first (turbo DAG build order).

## Skills consulted
`dudoxx-branding` (Toucan Signal identity values) · `dudoxx-design-system.md` (structural §25 grid) ·
`frontend-stack` / `i18n-nextintl` (Next.js 16 + locale lockstep) · `plan-feature-loop` (engine) ·
`browser-loop` (verify).
