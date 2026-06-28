/**
 * ddx-cli-ts - interactive styled-console demo for the ddx-terminal-bridge spike.
 *
 * Proves: a real TS program with a styled console (chalk) + a blocking interactive
 * prompt (@clack/prompts) runs in the shared tmux terminal, and an external agent can
 * answer the prompt via `tmux send-keys`. Run with: `pnpm start`.
 */

import chalk from 'chalk';
import { intro, outro, text, select, isCancel } from '@clack/prompts';

type Color = 'red' | 'green' | 'blue';

const PAINT: Record<Color, (s: string) => string> = {
  red: chalk.red,
  green: chalk.green,
  blue: chalk.blue,
};

async function main(): Promise<void> {
  intro(chalk.cyan.bold('ddx-cli-ts') + chalk.dim(' - styled console + interactive prompt'));

  // BLOCKING interactive prompt - the agent must answer this via send-keys.
  const name = await text({
    message: 'What is your name?',
    placeholder: 'world',
    defaultValue: 'world',
  });
  if (isCancel(name)) {
    outro(chalk.red('cancelled'));
    process.exit(1);
  }

  const color = await select<Color>({
    message: 'Pick a color',
    options: [
      { value: 'red', label: 'red' },
      { value: 'green', label: 'green' },
      { value: 'blue', label: 'blue' },
    ],
    initialValue: 'green',
  });
  if (isCancel(color)) {
    outro(chalk.red('cancelled'));
    process.exit(1);
  }

  outro(PAINT[color](`DDX-CLI-TS-DONE name=${name} color=${color}`));
}

void main();
