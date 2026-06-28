# ddx-term-web-specialist — memory (session pitfalls, cap 80 lines)

<!-- one-line entries: [DOMAIN] · TYPE · lesson. (commit) -->
2026-06-28 · [TERM-WEB] · PITFALL · Polling for terminal list updates is necessary for agent-created terminals to appear live.
2026-06-28 · [TERM-WEB] · RULE · Use `noServer: true` for `ws.Server` when integrating with an existing HTTP server.
2026-06-28 · [TERM-WEB] · DISCOVERY · WebSocket frames and input require explicit end-to-end handling for live terminal functionality.
2026-06-28 · [TERM-WEB] · PITFALL · Avoid using native `<select>` for complex UI like font/theme pickers; use custom controls instead.
2026-06-28 · [TERM-WEB] · RULE · Persist terminal appearance settings (font size, theme) to localStorage for live application and cross-tab sync.
2026-06-28 · [TERM-WEB] · RULE · Use `useSyncExternalStore` for cross-tab synchronization of UI state like terminal appearance.
2026-06-28 · [TERM-WEB] · RULE · Centralize appearance logic (themes, fonts, sizes) in a dedicated module (`appearance.ts`).
2026-06-28 · [TERM-WEB] · DISCOVERY · xterm's `ITheme` cannot parse OKLCH; raw hex is an acceptable exemption for custom themes.
