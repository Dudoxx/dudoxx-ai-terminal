# ddx-cli-py — interactive Rich CLI fixture

Purpose: a real Python interactive program (Rich console + blocking prompts) used as a test fixture
for the ddx-terminal-bridge spike — proves the terminal bridge can run uv-based Python CLIs and that
an agent can answer interactive prompts via `tmux send-keys`.

## Run
```sh
uv run main.py          # uses .venv automatically — no manual activate
```
Answers two blocking `Prompt.ask` prompts (name, color) then prints a Rich table + a
`DDX-CLI-PY-DONE name=… color=…` marker line (used by the spike's assertions).

## Conventions
- uv-managed (`pyproject.toml` + `uv.lock` + `.venv`); deps via `uv add <pkg>`.
- Type hints + explicit return types (`-> None`); zero `Any` (global Python rules).
- Pyright "could not resolve rich" in-editor = wrong interpreter; point the editor at
  `.venv/bin/python`. `uv run` resolves it correctly.

Attribution: Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
