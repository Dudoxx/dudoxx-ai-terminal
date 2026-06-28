/**
 * tmux.client.spec.ts — assert the EXACT argv each method shells out to.
 *
 * execFile is mocked so no real tmux/ps/pgrep/kill runs. Each test pins the
 * argv the wrapper produces — the load-bearing contract is that:
 *   - sendKeysLiteral uses -l with the literal text (no key parsing),
 *   - capturePaneVisible has NO -S (visible grid), capturePaneScrollback has -S -N,
 *   - every tmux call is prefixed with -S <socket> and targets <session>:<window>.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// Captured calls: [bin, args].
const calls: Array<{ bin: string; args: string[] }> = [];
// Per-test stdout: a fixed string for single-shot calls, OR a resolver that maps
// (bin, args) → stdout for multi-call walks (descendantPids' repeated pgrep -P).
let nextStdout = '';
let stdoutFor: ((bin: string, args: string[]) => string) | undefined;

vi.mock('node:child_process', () => ({
  execFile: (
    bin: string,
    args: string[],
    cb: (err: Error | null, res: { stdout: string; stderr: string }) => void,
  ): void => {
    calls.push({ bin, args });
    const stdout = stdoutFor !== undefined ? stdoutFor(bin, args) : nextStdout;
    cb(null, { stdout, stderr: '' });
  },
}));

const { TmuxClient } = await import('./tmux.client.js');

const SOCK = '/tmp/ddx-term.test.sock';
const SESS = 'ddx-test';

function client(): InstanceType<typeof TmuxClient> {
  return new TmuxClient({ socket: SOCK, session: SESS });
}

beforeEach(() => {
  calls.length = 0;
  nextStdout = '';
  stdoutFor = undefined;
});

describe('TmuxClient argv contract', () => {
  it('sendKeysLiteral uses -l with literal text and NO key parsing', async () => {
    await client().sendKeysLiteral('@7', 'npm test');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      bin: 'tmux',
      args: ['-S', SOCK, 'send-keys', '-t', `${SESS}:@7`, '-l', 'npm test'],
    });
  });

  it('sendKey sends a tmux KEY NAME (Enter) with no -l', async () => {
    await client().sendKey('@7', 'Enter');
    expect(calls[0]?.args).toEqual(['-S', SOCK, 'send-keys', '-t', `${SESS}:@7`, 'Enter']);
    expect(calls[0]?.args).not.toContain('-l');
  });

  it('capturePaneVisible has NO -S (visible viewport grid)', async () => {
    await client().capturePaneVisible('@7', false);
    expect(calls[0]?.args).toEqual(['-S', SOCK, 'capture-pane', '-p', '-t', `${SESS}:@7`]);
    // The only -S present is the socket flag (index 0), never a capture -S.
    expect(calls[0]?.args.slice(2)).not.toContain('-S');
  });

  it('capturePaneVisible with ANSI adds -e', async () => {
    await client().capturePaneVisible('@7', true);
    expect(calls[0]?.args).toEqual(['-S', SOCK, 'capture-pane', '-p', '-t', `${SESS}:@7`, '-e']);
  });

  it('capturePaneScrollback includes -S -<N>', async () => {
    await client().capturePaneScrollback('@7', 200);
    expect(calls[0]?.args).toEqual(['-S', SOCK, 'capture-pane', '-p', '-t', `${SESS}:@7`, '-S', '-200']);
  });

  it('newWindow requests window_id + pane_pid + cwd and parses them', async () => {
    nextStdout = '@9\t38638\t/home/u/proj\n';
    const res = await client().newWindow('build', '/home/u/proj');
    expect(calls[0]?.args).toEqual([
      '-S', SOCK, 'new-window', '-t', SESS, '-P', '-F', '#{window_id}\t#{pane_pid}\t#{pane_current_path}', '-n', 'build', '-c', '/home/u/proj',
    ]);
    expect(res).toEqual({ windowId: '@9', panePid: 38638, cwd: '/home/u/proj' });
  });

  it('killWindow targets the addressed window', async () => {
    await client().killWindow('@9');
    expect(calls[0]?.args).toEqual(['-S', SOCK, 'kill-window', '-t', `${SESS}:@9`]);
  });

  it('listWindows parses tab-delimited rows', async () => {
    nextStdout = '@0\tmain\t100\tzsh\t/a\t1\n@1\tbuild\t200\tnode\t/b\t0\n';
    const rows = await client().listWindows();
    expect(calls[0]?.args).toEqual([
      '-S', SOCK, 'list-windows', '-t', SESS, '-F',
      '#{window_id}\t#{window_name}\t#{pane_pid}\t#{pane_current_command}\t#{pane_current_path}\t#{window_active}',
    ]);
    expect(rows).toEqual([
      { windowId: '@0', windowName: 'main', panePid: 100, command: 'zsh', cwd: '/a', active: true },
      { windowId: '@1', windowName: 'build', panePid: 200, command: 'node', cwd: '/b', active: false },
    ]);
  });

  it('panePid reads #{pane_pid} via display-message', async () => {
    nextStdout = '38638\n';
    const pid = await client().panePid('@7');
    expect(calls[0]?.args).toEqual(['-S', SOCK, 'display-message', '-p', '-t', `${SESS}:@7`, '#{pane_pid}']);
    expect(pid).toBe(38638);
  });

  it('paneDimensions parses #{pane_width}x#{pane_height}', async () => {
    nextStdout = '120x30\n';
    const dims = await client().paneDimensions('@7');
    expect(calls[0]?.args).toEqual(['-S', SOCK, 'display-message', '-p', '-t', `${SESS}:@7`, '#{pane_width}x#{pane_height}']);
    expect(dims).toEqual({ cols: 120, lines: 30 });
  });

  it('childPids calls pgrep -P and parses pids', async () => {
    nextStdout = '39362\n39400\n';
    const pids = await client().childPids(38638);
    expect(calls[0]).toEqual({ bin: 'pgrep', args: ['-P', '38638'] });
    expect(pids).toEqual([39362, 39400]);
  });

  it('descendantPids walks the FULL tree (children + grandchildren) via repeated pgrep -P', async () => {
    // Mock a 2-level tree: 100 → [200, 201]; 200 → [300]; 201, 300 → leaves.
    // Keyed by the `pgrep -P <pid>` argument so the BFS walk resolves per node.
    const tree: Record<string, string> = {
      '100': '200\n201\n',
      '200': '300\n',
      '201': '',
      '300': '',
    };
    stdoutFor = (_bin, args) => tree[args[1] ?? ''] ?? '';

    const pids = await client().descendantPids(100);
    // panePid (100) itself is NOT included; the full descendant set is.
    expect(pids.sort((a, b) => a - b)).toEqual([200, 201, 300]);
    // It probed grandchild 300 — discovered via the 200 branch (depth-2 reach).
    expect(calls.some((c) => c.bin === 'pgrep' && c.args[1] === '300')).toBe(true);
  });

  it('killPid execs kill -<signal> <pid>', async () => {
    await client().killPid('TERM', 39362);
    expect(calls[0]).toEqual({ bin: 'kill', args: ['-TERM', '39362'] });
  });

  it('every tmux call prefixes -S <socket> as the first two args', async () => {
    nextStdout = '120x30\n';
    await client().paneDimensions('@7');
    expect(calls[0]?.args.slice(0, 2)).toEqual(['-S', SOCK]);
  });
});
