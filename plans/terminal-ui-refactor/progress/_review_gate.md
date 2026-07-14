# Review Gate — terminal-ui-refactor (2026-07-14)

## code-reviewer: approved_with_comments — both WARNs RESOLVED
- WARN edit-route stub (view/[id]/edit had no distinct behavior; docstring claimed rename-by-default):
  FIXED — wired `autoRename` prop TerminalWorkspace(mode='edit') → TerminalSidePanel → active TerminalRow
  starts in 'rename' state. Doc now matches code. typecheck+lint+8 web tests green.
- WARN async snapshot race (pushInitialSnapshot ordering relied on "in practice" comment):
  HARDENED — added broker gateway spec test "sends the snapshot frame FIRST, before any live output
  frame, on attach" (dispatches a live frame immediately post-attach, asserts messages[0].type==='snapshot').
  Gateway spec now 10 tests (was 9), all green.

## security-reviewer: no CRITICAL/HIGH
- Snapshot push socket-scoped (no cross-terminal leak) ✓
- Scrollback bounded (SCROLLBACK_LINES=500, never bare -S) ✓
- terminalId-mismatch-1008 isolation guard intact ✓
- MCP execFile array-argv, no shell injection ✓
- MED (FOLLOW-UP, pre-existing, NOT in this diff): term.gateway.ts:189 `match[1] as TerminalId` unchecked
  cast at WS-entry boundary — re-validated downstream via toTerminalId() so no live injection/crash path.
  Recommend hardening: TerminalIdSchema.safeParse right after regex match + close(1008) on failure.
  Filed as a follow-up (not blocking this plan — pre-existing pattern, out of scope per Cardinal #5).
