/**
 * BrokerLogger — minimal LoggerService for the term broker.
 * Mirrors ddx-api QuietLogger shape: suppresses RouterExplorer noise,
 * timestamps every line, respects LOG_LEVEL env.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { LoggerService } from '@nestjs/common';

const SUPPRESSED_CONTEXTS = new Set(['RouterExplorer', 'RoutesResolver']);

function timestamp(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `[${h}:${m}:${s}.${ms}]`;
}

function stringify(message: string | object | Error): string {
  if (message instanceof Error) return message.message;
  if (typeof message === 'string') return message;
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

export class BrokerLogger implements LoggerService {
  readonly startTime = Date.now();
  private readonly logLevel: string;

  constructor() {
    this.logLevel = (process.env['LOG_LEVEL'] ?? 'info').toLowerCase();
  }

  log(message: string | object, context?: string): void {
    if (context !== undefined && SUPPRESSED_CONTEXTS.has(context)) return;
    process.stdout.write(
      `${timestamp()} info  [${context ?? 'App'}] ${stringify(message)}\n`,
    );
  }

  error(message: string | object, trace?: string, context?: string): void {
    process.stderr.write(
      `${timestamp()} error [${context ?? 'App'}] ${stringify(message)}\n`,
    );
    if (trace) process.stderr.write(`${trace}\n`);
  }

  warn(message: string | object, context?: string): void {
    if (context !== undefined && SUPPRESSED_CONTEXTS.has(context)) return;
    process.stdout.write(
      `${timestamp()} warn  [${context ?? 'App'}] ${stringify(message)}\n`,
    );
  }

  debug(message: string | object, context?: string): void {
    if (this.logLevel !== 'debug' && this.logLevel !== 'verbose') return;
    process.stdout.write(
      `${timestamp()} debug [${context ?? 'App'}] ${stringify(message)}\n`,
    );
  }

  verbose(message: string | object, context?: string): void {
    if (this.logLevel !== 'verbose') return;
    process.stdout.write(
      `${timestamp()} trace [${context ?? 'App'}] ${stringify(message)}\n`,
    );
  }
}
