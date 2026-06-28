/**
 * tsup.config.ts — publish bundle for @dudoxx/ddx-term-mcp.
 *
 * Bundles the in-workspace @ddx/term-contract INTO dist/server.js so the
 * published package is self-contained (no workspace:* dep on the registry).
 * Keeps zod + @modelcontextprotocol/sdk EXTERNAL — they install from npm as
 * normal runtime deps. Emits a single ESM bundle with a node shebang so the
 * `ddx-term-mcp` bin runs under `node` / `npx`.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */
import { defineConfig } from 'tsup';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

// Read the package version at build time so the server's self-reported version
// always matches package.json (never hardcode it in server.ts — it drifts).
const pkg = createRequire(import.meta.url)('./package.json') as { version: string };

export default defineConfig({
  entry: { server: 'src/server.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  // Inject the version as a build-time constant consumed by server.ts.
  define: {
    __PKG_VERSION__: JSON.stringify(pkg.version),
  },
  // Resolve @ddx/term-contract to its TS SOURCE (not its compiled dist) so tsup
  // compiles it fresh as ESM. Bundling the contract's built dist/esm pulled in
  // emitted `require("zod/v4")` calls that fail under ESM (Dynamic require error).
  esbuildOptions(options) {
    options.alias = {
      ...options.alias,
      '@ddx/term-contract': resolve(
        import.meta.dirname,
        '../packages/ddx-term-contract/src/index.ts',
      ),
    };
  },
  // Bundle the contract in; keep real runtime deps external.
  noExternal: ['@ddx/term-contract'],
  external: ['zod', '@modelcontextprotocol/sdk'],
  // NOTE: no `banner` shebang — src/server.ts already starts with
  // `#!/usr/bin/env node` and tsup preserves it. Adding a banner here would
  // emit a DUPLICATE shebang on line 2 → Node SyntaxError.
  clean: true,
  sourcemap: false,
  dts: false,
  splitting: false,
  minify: false,
});
