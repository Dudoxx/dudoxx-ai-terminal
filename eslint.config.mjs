// @ts-check
/**
 * eslint.config.mjs — single shared ESLint 9 flat config for the whole monorepo.
 *
 * ESLint v9 flat config auto-discovers the nearest `eslint.config.*` by walking
 * up from each linted file, so this ONE root config governs every workspace
 * package (broker, mcp, web, contract, e2e) — each package's `lint` script just
 * runs `eslint` and resolves here. DRY: one source of truth for the TS-strict
 * ruleset, matching tsconfig.base.json (strict, noUncheckedIndexedAccess).
 *
 * Type-aware linting is intentionally NOT enabled (no `projectService`): it would
 * force every package's tsconfig into the lint graph and slow CI for little gain
 * over `tsc --noEmit`, which already runs as the typecheck gate. The rules here
 * are the syntactic/correctness layer; `pnpm typecheck` is the type layer.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  // ── Ignore generated / vendored output (flat-config global ignores) ─────────
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/node_modules/**',
      '**/coverage/**',
      // Next.js standalone bundle copied into the MCP publish artifact.
      'ddx-term-mcp/dist/**',
      // Generated type shim.
      '**/next-env.d.ts',
    ],
  },

  // ── Base JS + TS recommended rulesets (all *.ts / *.tsx / *.mjs) ────────────
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // ── Repo-wide language options + house rules ────────────────────────────────
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // TS-strict house rule: zero `any` (Cardinal: zero any across all TS).
      '@typescript-eslint/no-explicit-any': 'error',
      // Allow intentionally-unused args prefixed with `_` (common in stubs/DI).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // ── NestJS broker: decorators + emitted metadata need these relaxations ─────
  {
    files: ['ddx-term-broker/**/*.ts'],
    rules: {
      // NestJS DI relies on parameter decorators on otherwise-unused params.
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },

  // ── App/library source: no stray console (servers use a logger / stderr) ────
  {
    files: ['ddx-term-broker/src/**/*.ts', 'ddx-term-mcp/src/**/*.ts', 'packages/**/src/**/*.ts'],
    rules: {
      // Allow console.warn/error (operational), flag console.log (debug leftovers).
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // ── Test files + e2e helpers: looser (mocks, stubs, console, assertions) ─────
  {
    files: ['**/*.spec.ts', '**/*.test.ts', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  // ── Plain Node ESM scripts (.mjs) — no TS project, browser-free ─────────────
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },

  // ── Web (Next.js) gets browser globals on client code ───────────────────────
  {
    files: ['ddx-term-web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
);
