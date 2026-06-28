# Changelog — dudoxx-ai-terminal

Project-level history for the monorepo. The published package
`@dudoxx/ddx-term-mcp` keeps its own Changesets-managed log at
[`ddx-term-mcp/CHANGELOG.md`](./ddx-term-mcp/CHANGELOG.md) — that one is authoritative
for npm release notes.

Format: [Keep a Changelog](https://keepachangelog.com/). This repo uses
[Changesets](https://github.com/changesets/changesets) for the publishable package;
non-published packages (broker, web, contract) are tracked here.

## [Unreleased]

### Added
- `ddx-documentation/` — full technical docs tree (architecture, packages, MCP reference,
  development, publishing) for coders.
- DDX Harness bootstrap: root `CLAUDE.md` + `.claude/agents/` specialists
  (broker/mcp/web) + `context/_invariants.md` + `REMINDERS.md` + agent memory sidecars.
- Referencable docs: `CLAUDE_ARCHITECTURE.md`, `CLAUDE_PACKAGES.md`, `CLAUDE_PUBLISHING.md`.
- Operational docs: `INSTALLATION.md`, `SETUP.md`, `DEPENDENCIES.md`, this `CHANGELOG.md`.
- README **Release & versioning** section documenting the Changesets → npm flow.

### Fixed
- README publish note corrected: `@dudoxx/ddx-term-mcp` IS publish-ready (tsup bundles the
  contract into `dist/server.js`); the prior "npx not available yet" claim was stale.

## History (pre-changelog, from git)

- `bf7aef1` — broker: idempotent destroy + boot registry reconcile.
- `d1e3bc1` — terminal: browser-verified WS resilience + render fixes.
- `0f9d5a4` — contract: `TermListEntry.active` optional w/ default(false).
- `9521334` — mcp docs: `DDX_TERM_BROKER_URL` must include the `/api/v1` broker prefix.
- `dbbe87a` — web: poll terminal list every 2s so agent-created terminals appear live.
- `45ca37e` — broker/web: live web terminal end-to-end — WS frames + input working.
- `c58dc3f` — stamp `serverInfo.version` from package.json at build → MCP `0.1.3`.
- `7891007` — host logos via raw.githubusercontent (npm strips data URIs) → MCP `0.1.2`.
- `0a5025d` — ci: automated release pipeline (changesets + Actions).
- `06a686c` — initial commit: dudoxx-ai-terminal shared multi-terminal bridge.

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
