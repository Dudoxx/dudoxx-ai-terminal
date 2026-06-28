# Shard 06 — Registry ownership: the WS↔control-mode↔MCP triangle (architectural note)

**Task id:** none of its own — this is an _index.md-surfaced architectural constraint folded into B1, B3,
B4. No standalone task; it governs the reciprocal contract between shards 03 and 04.

## The gap (pulled in per In-Session decomposition coverage)
The broker's terminal registry (terminalId↔windowId + process snapshots) is the SHARED truth that two
consumers resolve `terminalId`→`windowId` against:
1. the broker's own WS gateway (render path), and
2. the MCP server (agent path).

If MCP and broker each kept a divergent slug↔window map, a `term_send` from the agent and a render
subscription from the human could target different windows for the "same" terminalId — silent corruption.

## The decision (Decision Rubric rung 1 — simpler, precedented)
- **The broker OWNS the registry.** It is the single writer of terminalId↔windowId (allocated on
  `term_create`, freed on `term_destroy`), and exposes it via REST `GET /terminals` (+ `POST`/`DELETE`).
- **MCP has two modes:**
  - *broker-attached* (default in dev): MCP resolves terminalId→windowId by querying broker REST
    `GET /terminals` — the broker stays authoritative.
  - *standalone* (MCP run without the broker, e.g. agent-only smoke): MCP keeps its OWN slug↔window map
    in `terminal-map.ts`, persisted alongside the per-terminal read-cursor. This map is only authoritative
    when no broker is present; the moment a broker attaches, broker REST wins.
- The read-cursor (per-terminalId last-read offset) is MCP-local in BOTH modes (it is the agent's view of
  "what's new", not shared session truth).

## Why this is reciprocal
`term_create` (allocates terminalId, broker writes registry) ↔ `term_destroy` (frees it, broker clears
registry + MCP clears cursor) is an open/close resource pair. REST `POST /terminals` ↔ web "new tab"
caller + MCP `term_create`. control-mode `%output` produced (broker attach) ↔ consumed by WS gateway
broadcast. Every emit/open half has its consume/close reciprocal — see _index.md Reciprocal Pairs table.

## Enforcement
- B3 implements broker registry + REST.
- B1 implements MCP's broker-query path AND the standalone map (both behind one resolver interface).
- A B2 spec asserts: with a broker present, MCP resolves via REST (not the local map).
