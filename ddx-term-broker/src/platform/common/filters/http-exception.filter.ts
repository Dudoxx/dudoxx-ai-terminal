/**
 * Global HTTP exception filter — standardised error shape for the broker.
 * Mirrors the ddx-api pattern (platform/common/filters/http-exception.filter.ts).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response, Request } from 'express';

export interface ErrorBody {
  statusCode: number;
  message: string;
  path: string;
  timestamp: string;
  requestId: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const body = exceptionResponse as Record<string, unknown>;
        message =
          typeof body['message'] === 'string'
            ? body['message']
            : exception.message;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      if (process.env['NODE_ENV'] === 'development') {
        this.logger.error(`[STACK] ${exception.stack ?? ''}`);
      }
    }

    this.logger.error(
      `[HTTP ${status}] ${request.method} ${request.url} — ${message}`,
    );

    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const body: ErrorBody = {
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId,
    };

    response.status(status).json(body);
  }
}
