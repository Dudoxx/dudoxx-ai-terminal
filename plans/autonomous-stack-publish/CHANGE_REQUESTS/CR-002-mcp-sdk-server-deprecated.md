# CR-002 — @modelcontextprotocol/sdk `Server` class deprecated

**Status:** OPEN (follow-up, out of scope) · **Severity:** non-blocking (warning only)
**Found during:** Wave C / s1-supervisor diagnostics.

## Evidence
- ddx-term-mcp/src/server.ts:22, :74, :84 — `Server` from @modelcontextprotocol/sdk
  flagged TS6385 'Server' is deprecated. Pre-dates s1 (supervisor only added a memoized
  ensureStack call; it did not introduce the Server usage).
- Current dep: @modelcontextprotocol/sdk ^1.12.0. Newer SDK deprecates the Server class
  in favor of the McpServer high-level API.

## Why not fixed here
- Out of scope: this plan wires autonomous publish, not an SDK migration.
- Warning only — typecheck PASS, tests PASS, no-pty.spec.ts green. Does not block publish.

## Recommended follow-up
Migrate server.ts to the McpServer API (or pin/adjust SDK) in a dedicated CR. Verify the
10 term_* verbs + no-pty invariant still hold after migration.

---
# bn1 deviations (recorded by lead — verified coherent)
- **Broker bundling = dist-copy (pnpm deploy), NOT tsup-bundle** (NEEDS_REVIEW). NestJS
  decorators + reflect-metadata incompatible with esbuild — the predicted fallback fired.
  Tarball 125 MB packed (budget 250 MB). Lean alternative (ncc/pkg w/ CJS decorator support)
  is a future CR. Functional + booted; acceptable for first publish.
- **Cross-service authorizations (bn1 touched files outside its shard — verified necessary):**
  - ddx-term-mcp/src/supervisor/paths.ts — WEB_ENTRY corrected to the REAL standalone entry
    (.next/standalone/ddx-term-web/server.mjs) so next resolves its sibling node_modules.
  - ddx-term-web/server.mjs — derive Next app `dir` from import.meta (not process.cwd) so the
    detached-spawned web finds .next/ regardless of cwd. Correct for the daemon spawn model.
  - Both verified: entries exist on disk, MCP 64/64 tests PASS, web booted on 3461.
