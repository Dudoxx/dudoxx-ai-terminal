---
name: repo-is-own-workspace
description: dudoxx-ai-terminal is a standalone greenfield pnpm workspace, not a module inside dudoxx-ai-hms; Pattern Basis siblings live in the sibling hms repo
metadata:
  type: project
---

`dudoxx-ai-terminal` is its OWN greenfield pnpm/turbo workspace (the ddx-terminal-bridge feature).

**Why:** User-locked decision — HMS services are independent, not one workspace; this terminal-bridge
deliverable is a separate repo with 3 ddx-term-* packages + @ddx/term-contract.

**How to apply:** When planning here, the reuse/Pattern-Basis siblings to mirror are in the SIBLING repo
`/Users/optron/projects/sandboxes/dudoxx-ai-hms-sandbox/dudoxx-ai-hms` (ddx-sse-contract, ddx-fhir-r4-mcp,
ddx-api, ddx-web) — cite their absolute paths, but never add them to THIS workspace's globs. The repo-root
dirs `ddx-cli-py` / `ddx-cli-ts` are interactive e2e fixtures (proven in SPIKE Spike 2), NOT workspace
packages — keep them out of pnpm-workspace.yaml, never delete. The authoritative spec bundle lives in
`plans/ddx-terminal-bridge/` (discuss/ARCHITECTURE/FEATURES/MCP-SPEC/RESPONSIVENESS/SPIKE).
