# ddx-cli-ts — interactive TUI CLI fixture

Purpose: a real TS interactive program (chalk styled console + @clack/prompts TUI) used as a test
fixture for the ddx-terminal-bridge spike — proves the terminal bridge can run tsx-based TS CLIs and
that an agent can drive a RAW-MODE TUI (arrow-key select) via `tmux send-keys`.

## Run
```sh
pnpm start              # tsx src/main.ts
pnpm exec tsc --noEmit  # typecheck (strict)
```
Answers a `text` prompt (name) and a `select` prompt (color, arrow-key navigated) then prints a
`DDX-CLI-TS-DONE name=… color=…` marker line (used by the spike's assertions).

## Driving it from an agent (send-keys)
- Text prompt: `send-keys -l '<answer>'` + `send-keys Enter`.
- Select prompt: `send-keys Down/Up` (KEY NAMES) to move the `●`, then `send-keys Enter`.

## Conventions
- ESM (`"type":"module"`), strict TS, `@types/node` + tsconfig with `skipLibCheck`.
- Zero `any`/`unknown`; typed `PAINT` map narrows the clack `select` union.

Attribution: Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
