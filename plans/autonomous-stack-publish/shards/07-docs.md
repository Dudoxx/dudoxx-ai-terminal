# Shard 07 — docs (DOX pass)

| Field | Value |
|---|---|
| Layer | docs |
| Agent | Atlas (docs) |
| Skills | (none — docs) |
| Parallel? | No — group F, depends on publish-ci (06); documents the finished behavior |
| Task id | `d1-docs` |

## Why
The user-facing payoff (one-command `claude mcp add` install + autonomous bootstrap) is only real if it is documented. Plus a DOX pass on the CLAUDE.md cascade is mandatory after a contract/workflow change (root CLAUDE.md governs; closer-wins per-package).

## Scope
1. **`ddx-term-mcp/README.md` + `INSTALLATION.md`** — document the npx one-command install (`claude mcp add ddx-term -- npx -y @dudoxx/ddx-term-mcp`, both user + project scope), the autonomous bootstrap (first `term_*` call ensures broker+web are running, machine-wide singleton), and the env vars: `DDX_TERM_WEB` (set `0` to disable web spawn), `DDX_TERM_BROKER_PORT` (6481), `DDX_TERM_WEB_PORT` (3460), `DDX_TERM_SOCKET`. Remove any stale "not available" note (memory: publish is wired). Document PORT_CONFLICT behavior (what the user sees + how to override the port).
2. **Root `README.md`** — update the package table / install section to reflect the self-bootstrapping single-package story.
3. **`CLAUDE_PUBLISHING.md`** — document the extended publish flow: full-stack build (broker+web standalone inlined) → pack-manifest + size-budget gate → changeset publish; broker/web stay private + ignored.
4. **`.mcp.json.example`** — add/refresh an example showing the npx invocation + the env vars (create it at repo root if it does not exist).
5. **DOX pass on touched CLAUDE.md files** — update the closest owning CLAUDE.md where behavior/contract changed:
   - root `CLAUDE.md` — note the MCP is now self-bootstrapping (it launches broker/web); update the package table note.
   - `ddx-term-mcp/CLAUDE.md` — add the supervisor to Ownership + the autonomous-bootstrap local contract + the new env vars (`DDX_TERM_WEB`, `DDX_TERM_BROKER_PORT`, `DDX_TERM_WEB_PORT`).
   - `packages/ddx-term-contract/CLAUDE.md` — note the new `ports.ts` + `BrokerHealthSchema` ownership.
   - `ddx-term-broker/CLAUDE.md` — note health endpoint now returns the identity field.
   - Refresh any child index lines that changed.

## Boundaries
- Docs only — no code changes.
- Do NOT weaken any Cardinal / invariant in a CLAUDE.md (closer-wins applies only within T4; DOX framework).
- Keep the no-PTY invariant statement intact in `ddx-term-mcp/CLAUDE.md` — clarify that spawning `node` (not a shell/pty) for the supervisor is explicitly allowed.

## Pattern basis
- Existing `ddx-term-mcp/CLAUDE.md` Env + Ownership sections — extend in place.
- `dox-framework.md` — the walk-then-update DOX pass procedure.

## Verification
`rg -n "DDX_TERM_WEB|DDX_TERM_BROKER_PORT|DDX_TERM_WEB_PORT" ddx-term-mcp/README.md ddx-term-mcp/INSTALLATION.md` returns hits; `.mcp.json.example` exists at root; each touched CLAUDE.md reflects the new behavior. Manual read-through that the install command is copy-paste correct.
