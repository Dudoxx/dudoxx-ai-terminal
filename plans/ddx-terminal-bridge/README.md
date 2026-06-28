# ddx-terminal-bridge — feature spec bundle (input to `/plan-feature`)

Stateful, shared, **multi-terminal** system: one persistent **tmux** session hosting **N addressable
terminals** (one tmux window each, stable `terminalId` + live `pid` introspection), driven by both a
**human** (web tabs / native) and an **AI agent** (via **MCP**, 9 verbs), with the agent as a thin
tmux client that **never owns a PTY**. Send = `send-keys -l` + Enter; capture = visible-viewport
snapshot (cols×lines grid) OR scrollback delta.

## Read order (Plan agent + humans)

1. **`discuss.md`** — precedence-bearing input: Scope · AC (15) · Boundaries · Authority · Decisions ·
   Parallel-hints · 4 Failure Modes · Pattern Basis. `/plan-feature` treats this as `--discuss` output.
2. **`ARCHITECTURE.md`** — 3-layer design, tmux control-mode keystone, `terminalId`/`pid` model (§1a),
   terminal registry (§3a), `ddx-*` package topology, terminal-scoped flows.
3. **`FEATURES.md`** — full enumerated feature list (v1/v2), owner-mapped, AC-traceable.
4. **`MCP-SPEC.md`** — the agent channel: 9 verbs (3 lifecycle + 6 per-terminal) + helpers, the
   send/capture mechanics (§3a — send-keys vs literal, viewport snapshot vs scrollback delta),
   JSON-RPC shapes, error model, invariants.
5. **`RESPONSIVENESS.md`** — latency budget + mechanisms + measurement (AC #1 verification).

Background research that seeded this: `../../findings/2026-06-28_stateful-terminal-agent-bridge/_index.md`.

## How to turn this into an executable plan

```
/plan-feature ddx-terminal-bridge — build the stateful shared tmux+MCP terminal bridge
```

`/plan-feature` will read `discuss.md` (+ companions), do pattern mining against `dudoxx-ai-hms`
(`ddx-api`, `ddx-web`, `ddx-fhir-r4-mcp`, `packages/ddx-sse-contract`), then emit `tasks.json`,
`_index.md`, `_invariants.md`, and `progress/` into THIS folder. **Do not hand-author `tasks.json`** —
the planner owns it (and its schema gates).

## Conventions locked (Dudoxx)

- Packages: `ddx-term-broker` (NestJS 11), `ddx-term-mcp` (stdio MCP), `ddx-term-web` (Next.js 16),
  `@ddx/term-contract` (shared zod types — mirrors `@ddx/sse-contract`).
- `modules/` = domain, `platform/` = wiring; kebab-case files; co-located `*.spec.ts`.
- Ports in 3400-3490 band (or host 6xxx dev band per `dudoxx-ai-hms/context/ENVIRONMENT.md`).
- Per-package CLAUDE.md (DOX); day-zero runnable; `docker-compose.dev.yml`.
- Attribution: `Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>`.
