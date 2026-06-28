# c3-error-codes — progress

## Status: completed

## Files modified
- `packages/ddx-term-contract/src/mcp-tools.ts`
  - Added PORT_CONFLICT + STACK_LAUNCH_FAILED to TermErrorCodeSchema z.enum
  - Added both rows (false) to TERM_ERROR_RETRIABLE record
  - Added both branches (retriable: z.literal(false)) to TermErrorSchema discriminated union

## Validation output (tail)
```
✓ src/mcp-tools.spec.ts (11 tests)
✓ src/ws-frames.spec.ts (9 tests)
Test Files  2 passed (2)
      Tests 20 passed (20)
(build clean, exit 0)
```

## Deviations
None. All three lockstep edits (enum + map + union) applied in a single pass.
