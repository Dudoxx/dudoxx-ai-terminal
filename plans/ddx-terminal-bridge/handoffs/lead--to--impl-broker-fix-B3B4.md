# Verdict: FAIL ❌ — broker tsc:check (7 type errors)

| Field | Value |
|-------|-------|
| Task ref | B3 (session.service) + B4 (terminal.service, term.gateway) |
| Producer | impl-broker (shut down) |
| Reviewer | main-session lead |
| Attempt | 1 of 3 |

## Why this slipped through
B3/B4 validation was `build && test` only. `nest build` uses SWC (strips types) and
jest uses ts-jest (lenient) — neither runs full `tsc`. The package's own
`pnpm -F ddx-term-broker tsc:check` (= `tsc --noEmit -p tsconfig.json`) exits 2.
**The re-validation gate for this fix is `tsc:check` exit 0, in addition to build+test.**

The branded `WindowId`/`TerminalId` types from `@ddx/term-contract` are doing exactly
their job — catching terminalId↔windowId conflation (FM#4) at compile time. Fix the
broker to use them correctly; do NOT loosen/cast away the brands.

## Issues (7 errors, 3 files)

### Issue 1 — ExecRunner returns Promise<string>, must be Promise<ExecResult> — Severity: High
- **Files**: `src/modules/session/session.service.ts:52`, `src/modules/terminal/terminal.service.ts:28`
- **Cause**: `promisify(...)` is given a HAND-WRITTEN callback wrapper
  `(file, args, cb) => execFile(file, args, cb)`. That defeats Node's `execFile`
  `promisify.custom` overload (which resolves to `{stdout, stderr}`), so TS infers
  `Promise<string>`. The contract type `ExecRunner = (file, args) => Promise<ExecResult>`
  (ExecResult = {stdout, stderr}) then mismatches.
- **Fix**: `const defaultExecRunner: ExecRunner = promisify(execFile);` — promisify
  `execFile` DIRECTLY (it carries promisify.custom → resolves `{stdout,stderr}`).
  Import `execFile` from `node:child_process`, `promisify` from `node:util`. Drop the
  manual 3-arg wrapper. (terminal.service.ts has the identical bug — fix both.)
- **Verify**: the `.exec(...)` call sites already destructure `{ stdout }` — confirm they still typecheck.

### Issue 2 — raw string passed where branded WindowId required — Severity: High
- **File**: `src/modules/session/session.service.ts:183, 191, 192`
- **Cause**: `rawWindowId` (plain `string` from `stdout.trim()`) is passed to
  `resolvePids(WindowId)` / `resolveCwd(WindowId)` / `resolveCommand(WindowId)`.
  Line 167 already creates the branded `const windowId = rawWindowId as WindowId`.
- **Fix**: pass the already-branded `windowId` variable (not `rawWindowId`) at lines
  183/191/192. `rawWindowId` stays only where a raw tmux-target string is needed
  (the `${SESSION_NAME}:${rawWindowId}` template at line 179 — that one is fine, it's
  string interpolation). Minimal change: 3 call-site swaps `rawWindowId` → `windowId`.

### Issue 3 — gateway wires the WRONG identifier into the control-mode resolver — Severity: Critical (logic bug, not just types)
- **File**: `src/modules/gateway/term.gateway.ts:112`
- **Cause**: `controlModeAttach.start((windowId: WindowId) => this.sessionService.resolveWindowId(windowId), ...)`.
  But `resolveWindowId(terminalId: TerminalId): WindowId | undefined` takes a **TerminalId**
  and RETURNS a WindowId. The attach service's `WindowIdResolver` type is
  `(terminalId: TerminalId) => WindowId | undefined`. The lambda mis-names its param
  `WindowId` and passes it straight through — a terminalId↔windowId conflation (FM#4).
- **Fix**: the resolver must accept a `TerminalId` and return its `WindowId`:
  `(terminalId: TerminalId) => this.sessionService.resolveWindowId(terminalId)`.
  Confirm against control-mode.attach.ts's `WindowIdResolver` type + how the parser
  produces the id it passes to the resolver — the control-mode `%output` frames carry
  a tmux window id; verify whether the resolver is meant to map windowId→terminalId
  (reverse) for dispatch, OR terminalId→windowId (forward) for send. If the attach loop
  needs windowId→terminalId for inbound %output dispatch, add/​use the REVERSE lookup
  (`resolveTerminalId(windowId)`) instead — read control-mode.attach.ts to determine
  direction, then wire the correct one. Do NOT just rename to silence the brand.
- **File also**: `term.gateway.ts:85` — `server` declared but never read (the
  `afterInit` assigns `this.server`); remove the unused local param binding or use it.

## Retry directive
- **Attempt 1 of 3.** Re-validation gate (ALL must pass):
  `pnpm -F ddx-term-broker build && pnpm -F ddx-term-broker test && pnpm -F ddx-term-broker tsc:check`
- **Do NOT touch**: packages/ddx-term-contract/ (contract is correct — ESM fix already
  landed by lead), ddx-term-mcp/, ddx-term-web/, root config, fixtures.
- Update `plans/ddx-terminal-bridge/progress/B3.md` + `B4.md` with the recovery note
  (what was wrong + the fix) — these are recovered tasks, /unify reports them DEVIATED.

Attribution: Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
