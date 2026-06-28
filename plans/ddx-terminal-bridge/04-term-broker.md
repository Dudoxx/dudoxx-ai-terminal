# Shard 04 — ddx-term-broker (Group B)

**Task ids:** `B3` (NestJS boot + session module: tmux session + registry + PID resolution),
`B4` (terminal module REST CRUD + control-mode parser/attach + WS gateway + specs)
**Agent:** nestjs-backend-specialist · **Skills:** create-nestjs, nestjs-backend, typescript-strict
**Parallel?** Yes — runs alongside the MCP package (Group B); B4 depends on B3.

## Why this shard
The render/transport + shared-state core: a NestJS 11 service that (1) creates & owns the ONE shared tmux
session, (2) owns the canonical terminal registry (terminalId↔windowId + process snapshots — the SHARED
truth both the WS gateway and the MCP server resolve against, see shard 06), (3) attaches via tmux
control-mode (`-CC`), parses `%output`/`%layout-change` frames, and (4) fans them out per-`/term/:terminalId`
WS subscription. Replaces the spike's ttyd with pane-faithful rendering (ARCHITECTURE §9 step 4).

## Mirror (Pattern Basis)
`dudoxx-ai-hms/ddx-api/` — `nest-cli.json` + `src/main.ts` boot (Helmet, Swagger `/docs`,
ZodValidationPipe, raw-body), `src/platform/common/` (filters / interceptors / guards / pino logging /
BootSummaryService — copy the `boot`, `filters`, `interceptors`, `logging` subtrees). `modules/` =
domain (session, terminal, control-mode, gateway), `platform/` = cross-cutting — never mix
(`module-layout.md`). Use the **create-nestjs** skill for the day-zero skeleton, then add the modules.

## Session module (B3) — the spike-critical session creation
- Create with **`tmux -f /dev/null -S $SOCK new-session -d -s ddx-shared -x 120 -y 30`** (isolated config
  — MUST NOT inherit `~/.tmux.conf`, SPIKE footgun #2 / invariant).
- Pin with **`set-option -g default-size 120x30`** — NEVER `set-window-option -g window-size manual`
  (that + `new-window` on a detached session KILLS tmux 3.6a — SPIKE footgun #1, PRODUCTION-DAY-1 CRASH).
- `SessionService` owns canonical dims (resize arbitration, FM#2), the `Map<terminalId, TerminalDescriptor>`
  registry, and PID resolution (`#{pane_pid}` shell + `pgrep -P` foreground child) as SNAPSHOTS.
- Health endpoint (session present, socket alive).

## Terminal module + control-mode + gateway (B4)
- REST CRUD: `GET/POST/DELETE /terminals[/:terminalId]` + `GET /terminals/:id/snapshot` (the REST mirror
  of MCP `term_create`/`term_list`/`term_destroy`/`term_snapshot`). DTOs validated by zod schemas from
  `@ddx/term-contract`.
- `control-mode.parser.ts` (golden-fixture tested) + `control-mode.attach.ts` (spawns `tmux -CC attach`,
  line-reads stdout → typed frames tagged with `terminalId`).
- `term.gateway.ts` `@WebSocketGateway` per `/term/:terminalId`: broadcasts `%output` frames to that
  terminal's subscribers, ingests keystroke `input` frames → `send-keys`. Per-terminal routing (a busy
  build in `a` never pushes to `b` subscribers — RESPONSIVENESS §2.8). Frame-coalesce ~16ms (flood control).

## Boundaries
- The broker spawns `tmux` only — never a raw shell, never `node-pty`. Window 0 = human; agent uses
  window 1+ (`AGENT_OWN_WINDOW`, AC #9).
- Do NOT duplicate any `@ddx/term-contract` type locally.

## Verification
`session.service.spec.ts` (session create uses `-f /dev/null` + `default-size`, NOT `window-size manual`),
`terminal.service.spec.ts` (terminalId↔window + panePid/fgPid resolution), `control-mode.parser.spec.ts`
(golden frames), `term.gateway.spec.ts` (per-terminalId fan-out + keystroke ingest). `pnpm -F
ddx-term-broker build && test`. See tasks.json `B3`,`B4`.
