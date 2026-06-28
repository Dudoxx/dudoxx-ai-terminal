# @ddx/term-contract — CLAUDE.md (DOX local contract)

## Purpose
The single source of truth for every type that crosses a package boundary in
ddx-terminal-bridge: WebSocket frames (broker ↔ web), MCP tool I/O schemas
(`mcp-tools.ts`), and the terminal/session descriptors. Dual-built (ESM + CJS +
types) so a Next.js front end, a NestJS broker, and an ESM MCP server all consume
the identical schemas from one place. Schemas are zod/v4 (peer dependency).

## Ownership
Owns `src/{terminal,session,ws-frames,mcp-tools}.ts` and the re-export barrel
`src/index.ts`. No runtime logic, no I/O — types and zod schemas only.

## Local Contracts
- **All shared zod types live HERE and ONLY here.** Never duplicate a schema in
  broker / mcp / web — import from `@ddx/term-contract`. (Invariant.)
- **Two identifiers, never conflated:** `terminalId` = the STABLE handle that
  every API ADDRESSES (== one tmux window); `pid` = the TRANSIENT process id that
  signal/observe verbs OPERATE ON. The contract types must keep these distinct
  fields — a schema that merges them is forbidden.
- Dual build: `import` → `dist/esm`, `require` → `dist/cjs`, `types` →
  `dist/types`. Keep `exports` map and the three `tsconfig.*.json` in lockstep.
- `zod` is a peerDependency — never a hard dependency; the consumer pins it.
- Zero `any`. kebab-case filenames; `*.spec.ts` co-located.

## Verification
`pnpm --filter @ddx/term-contract build` (esm+cjs+types) then
`pnpm --filter @ddx/term-contract test` (vitest). Typecheck:
`pnpm --filter @ddx/term-contract typecheck`. A green build here is a prerequisite
for broker/mcp/web builds (turbo `^build`).

---
Attribution: Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
