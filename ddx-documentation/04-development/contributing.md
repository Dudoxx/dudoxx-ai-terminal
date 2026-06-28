---
title: Contributing
description: Contribution workflow — branch naming, commit style, the attribution footer, and the changeset-per-change requirement.
audience: developers
tags: [contributing, git, branches, commits, changesets, attribution]
updated: 2026-06-28
---

# Contributing

## Branch naming

Use a typed prefix:

```
feature/<slug>      # new capability
fix/<slug>          # bug fix
refactor/<slug>     # behaviour-preserving restructuring
docs/<slug>         # documentation only
```

## Commit style

- Imperative subject, **≤ 50 characters** (e.g. `add term_panes pid validation`).
- One logical change per commit; keep the diff focused (no drive-by refactors).
- Documentation and comments are part of the change, not a follow-up — update the doc,
  spec, or JSDoc that a change invalidates in the **same** commit.

## Attribution footer

Every authored file and document carries this footer / author line:

```
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
```

The publishable package's `author` field, the workspace files, and these docs all use
it verbatim.

## A changeset per change

The repo uses [Changesets](https://github.com/changesets/changesets) for versioning
and publishing. **Any change that affects the publishable package
(`@dudoxx/ddx-term-mcp`) needs a changeset** describing the change and its semver bump:

```sh
pnpm changeset
```

The interactive prompt records the bump (patch / minor / major) and a summary. Only
`@dudoxx/ddx-term-mcp` is publishable — the broker, web, contract, and e2e packages are
in the `ignore` list of `.changeset/config.json`, so changes to them do not require a
changeset for publish purposes (though a changeset is still good practice when the
contract change reaches the published bundle).

> Because the contract is **bundled** into the published MCP server at build time, a
> contract change that alters the MCP's public behaviour warrants a `@dudoxx/ddx-term-mcp`
> changeset even though the contract itself is never published.

Full release mechanics: [release flow](../05-publishing/release-flow.md).

## Before you push

```sh
pnpm typecheck
pnpm lint
pnpm test
```

Keep the [invariants](./invariants.md) intact — `no-pty.spec.ts` and the contract's
type-sharing rule will fail the build if you break invariant 1 or 7. Honour the
others (pinned geometry, `send -l`, `tmux -f /dev/null`, never manual window-size) by
review.

## See also

- [Invariants](./invariants.md) — the rules a change must not break.
- [Build & test](./build-and-test.md) — the commands above in detail.
- [Release flow](../05-publishing/release-flow.md) — what happens after merge.

---
Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
