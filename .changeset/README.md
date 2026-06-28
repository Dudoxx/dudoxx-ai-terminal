# Changesets

This folder holds [changesets](https://github.com/changesets/changesets) — one
markdown file per pending change, describing **what changed** and **how to bump
the version** (patch / minor / major).

## Workflow

1. After making a change to a publishable package, run:
   ```sh
   pnpm changeset
   ```
   Pick the package(s), the bump type, and write a one-line summary.

2. Commit the generated `.changeset/*.md` alongside your code.

3. On merge to `main`, CI (`.github/workflows/release.yml`) opens a
   **"Version Packages"** PR that applies the bumps + writes the CHANGELOG.

4. Merging that PR publishes the changed packages to npm automatically.

## Publishable packages

Only **`@dudoxx/ddx-term-mcp`** is published. The other workspace packages
(`@ddx/term-contract`, `ddx-term-broker`, `ddx-term-web`, `@dudoxx/ddx-term-e2e`)
are `ignore`d in `config.json` — the contract is bundled into the MCP at build,
the broker/web/e2e are app/internal packages, not libraries.
