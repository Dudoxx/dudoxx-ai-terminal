/**
 * no-pty.spec.ts — FM#1 enforcement (invariant: MCP owns NO PTY).
 *
 * Greps the entire src/ tree for any pseudo-terminal usage. The MCP server must
 * shell out to tmux only — a private PTY breaks shared state (the webmux trap).
 * This test fails if any source file references a PTY library or spawns one.
 * Forbidden tokens are assembled at runtime (below) so this file's own source
 * stays clean for the raw-text grep gate too.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC_DIR = join(fileURLToPath(new URL('.', import.meta.url)));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

// Forbidden tokens assembled at runtime so this file's OWN source does not
// contain the literal strings (which would make a raw text grep over src/ fail).
const FORBIDDEN = ['node' + '-pty', 'pty' + '.spawn'];

describe('no-PTY invariant (FM#1)', () => {
  it('no source file references a pseudo-terminal library or spawns one', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_DIR)) {
      // Skip this enforcement file itself.
      if (file.endsWith('no-pty.spec.ts')) continue;
      const content = readFileSync(file, 'utf8');
      for (const token of FORBIDDEN) {
        if (content.includes(token)) offenders.push(`${file}: ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
