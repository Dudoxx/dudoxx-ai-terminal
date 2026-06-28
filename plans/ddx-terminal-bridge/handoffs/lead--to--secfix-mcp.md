# Verdict: FAIL ❌ (security) — mcp shallow PID-tree containment check

| Field | Value |
|-------|-------|
| Task ref | B1/B2 (tmux.client.childPids, term-signal.tool) |
| Reviewer | security-reviewer (HIGH-2) |
| Attempt | 1 of 3 |

## Issue — HIGH — term_signal pid-validation is depth-1 only (weakens AC#14 / FM#4 containment)
- **File**: `ddx-term-mcp/src/tmux/tmux.client.ts:270` (`childPids`) — used by `term-signal.tool.ts:40-41`
  to build the "pids this terminal may signal" set.
- **Cause**: `childPids(panePid)` = `pgrep -P <panePid>` returns ONLY DIRECT children. `term_signal` then
  builds `tree = {panePid, ...directChildren}` and rejects any pid not in it (PID_NOT_IN_TERMINAL).
  Grandchildren (e.g. a shell→make→cc chain, or a REPL subprocess) are NOT in the set — so either a
  legitimate descendant pid is wrongly rejected, OR (the security framing) the containment boundary the
  terminalId≠pid invariant rests on is incomplete. AC#14 ("validate it belongs to the terminal's tree")
  requires the FULL descendant tree, not depth-1.
- **Fix**: make the containment set the FULL recursive descendant set of panePid. Either:
  (a) recursive walk: BFS/DFS repeatedly `pgrep -P` each discovered pid until no new pids, OR
  (b) `pgrep -P` is insufficient — use a tree walk. (`pgrep --ns` is Linux-only; this runs on macOS too,
      so prefer the portable recursive `pgrep -P` walk with a visited-set + depth cap to avoid cycles.)
  Keep `childPids` returning direct children IF other callers (fgPid resolution) need that semantic — add a
  SEPARATE `descendantPids(panePid): Promise<number[]>` (full tree) and have `term-signal.tool.ts` use the
  descendant set for the containment check. Do NOT change fgPid resolution (it correctly wants depth-1).
- **Verify**: update tmux.client.spec.ts + term-signal.tool.spec.ts — a grandchild pid IS in the tree
  (accepted for signal); a truly foreign pid is still PID_NOT_IN_TERMINAL. Mock pgrep to return a 2-level tree.

## Re-validation gate (ALL exit 0)
`pnpm -F @dudoxx/ddx-term-mcp build && pnpm -F @dudoxx/ddx-term-mcp test`
Plus: `rg -n 'node-pty|pty\.spawn' ddx-term-mcp/src` stays empty (do not regress FM#1).

## Do NOT touch
ddx-term-broker/ (secfix-broker owns the gateway/controller fixes), packages/, ddx-term-web/, fixtures, root.
Append recovery note to progress/B2.md.

Attribution: Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
