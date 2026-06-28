/**
 * allow-list.ts — optional command allow/deny gate (Feature 8.2).
 *
 * Loaded from $DDX_TERM_ALLOWLIST (a JSON policy file). When unset, the gate is
 * a no-op (everything allowed). When set, term_send routes its text through
 * `check()` → throws COMMAND_DENIED on a denied command.
 *
 * Policy file shape:
 *   { "mode": "allow", "patterns": ["^npm ", "^pnpm "] }   // allow-list: only matches pass
 *   { "mode": "deny",  "patterns": ["rm -rf /", "^sudo "] } // deny-list: matches are rejected
 *
 * Patterns are JS regex sources tested against the trimmed command text.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { readFileSync } from 'node:fs';

import { z } from 'zod/v4';

import { TermError } from './errors.js';

const PolicySchema = z.object({
  mode: z.enum(['allow', 'deny']),
  patterns: z.array(z.string()),
});
type Policy = z.infer<typeof PolicySchema>;

/** Command gate. A no-op instance (no policy path) allows everything. */
export class AllowList {
  private readonly policy: Policy | null;
  private readonly compiled: RegExp[];

  private constructor(policy: Policy | null) {
    this.policy = policy;
    this.compiled = policy === null ? [] : policy.patterns.map((p) => new RegExp(p));
  }

  /** Build from an optional policy-file path; missing/unset → permissive no-op. */
  static fromPath(path: string | undefined): AllowList {
    if (path === undefined || path.length === 0) return new AllowList(null);
    const raw = readFileSync(path, 'utf8');
    const policy = PolicySchema.parse(JSON.parse(raw) as unknown);
    return new AllowList(policy);
  }

  /** Throw COMMAND_DENIED if `text` violates the policy; no-op when permissive. */
  check(text: string): void {
    if (this.policy === null) return;
    const trimmed = text.trim();
    const matched = this.compiled.some((re) => re.test(trimmed));
    const denied = this.policy.mode === 'allow' ? !matched : matched;
    if (denied) {
      throw new TermError('COMMAND_DENIED', `command denied by allow-list (mode=${this.policy.mode}): ${trimmed}`);
    }
  }
}
