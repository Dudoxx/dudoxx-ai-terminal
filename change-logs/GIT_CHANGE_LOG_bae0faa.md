# Change Log — main @ session 2026-06-28 20:34

**Date**: 2026-06-28 20:34  |  **Projects**: ddx-term-web, e2e

## Summary
Terminal UI max-customization: collapsible side-panel session nav, per-terminal
font-size control, and 8 selectable color themes — persisted to localStorage and
applied LIVE to xterm (no reconnect). Plus a 3-layer e2e tmux pty-leak fix that
prevents the macOS pty-pool exhaustion observed this session.

## Files Changed
- ddx-term-web/src/lib/term/appearance.ts (new) — theme + font registry, appearance model
- ddx-term-web/src/lib/term/settings-store.ts (new) — localStorage store + useTermAppearance
- ddx-term-web/src/lib/term/xterm-client.ts — live applyAppearance(); themes from registry
- ddx-term-web/src/components/term/AppearanceControls.tsx (new) — font/size/theme controls
- ddx-term-web/src/components/term/TerminalSidePanel.tsx (new) — collapsible session nav
- ddx-term-web/src/app/[locale]/terminal/page.tsx — 3-zone shell + live appearance wiring
- ddx-term-web/messages/{en,de,fr}.json — +new keys (41-key lockstep)
- ddx-term-web/package.json + pnpm-lock.yaml — add lucide-react@^1.22.0
- ddx-term-web/CLAUDE.md — DOX ownership map update
- e2e/helpers/global-tmux-sweep.ts (new) — vitest globalSetup pty-leak sweep
- e2e/helpers/tmux-sandbox.ts — process exit/signal pty reap handlers
- e2e/vitest.config.ts — wire globalSetup; fix reporter->reporters typo
- context/_invariants.md — document pty-leak prevention

## Build & Lint
- ddx-term-web: tsc clean (eslint skipped — no config; next lint deprecated in Next 16)
- e2e: tsc clean; vitest web suite 5/5 pass

## Commit
72c0d2b — feat(web): terminal customization + e2e pty-leak fix
