# Invariants — autonomous-stack-publish

> Floor inherited from `context/_invariants.md` + root CLAUDE.md. These MUST hold for every task.

## MUST
- The MCP server NEVER holds a PTY. The supervisor spawns a **node** process (`child_process.spawn` of `node`), never a shell, never `node-pty`/`pty.spawn`. `no-pty.spec.ts` stays green.
- All cross-boundary types come from `@ddx/term-contract` (ports, health-response schema). Never redefine in broker/mcp/web.
- Auto-spawned broker/web bind 127.0.0.1 ONLY (loopback trust; no TLS/auth).
- Exactly ONE broker + ONE web per machine — guarded by O_EXCL lockfile + PID + stale-timeout reclaim.
- Broker/web stay `private:true` and in changeset `ignore[]`. They ship ONLY inlined inside the `@dudoxx/ddx-term-mcp` tarball, never as their own registry packages.
- Zero `any` across all TypeScript.
- The 10 `term_*` verb I/O contracts are unchanged.

## NEVER
- Never make broker/web their own npm packages.
- Never add remote/multi-machine discovery (machine-local only).
- Never require Docker.
- Never silent-attach to a foreign process on a canonical port — emit a clear PORT_CONFLICT error naming the port + override env.
- Never spawn web eagerly when `DDX_TERM_WEB=0`.

## Ports (canonical, env-overridable)
- broker `6481` (`DDX_TERM_BROKER_PORT`)
- web `3460` (`DDX_TERM_WEB_PORT`)
- tmux socket `/tmp/ddx-term.sock` (`DDX_TERM_SOCKET`)
- MCP sets `DDX_TERM_BROKER_URL=http://127.0.0.1:<brokerPort>` after liveness, so `resolver-factory.ts` selects `BrokerRestResolver` (attached path).
