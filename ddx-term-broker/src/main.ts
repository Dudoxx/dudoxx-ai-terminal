/**
 * ddx-term-broker — entry point.
 *
 * Boot sequence mirrors ddx-api/src/main.ts:
 *   Helmet → WsAdapter → CORS → global prefix → HttpExceptionFilter →
 *   LoggingInterceptor → Swagger → listen → BootSummaryService.renderAll()
 *
 * Port: DDX_TERM_BROKER_PORT env (default 6481, matching compose dev band).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { Server as HttpServer } from 'http';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { version as APP_VERSION } from '../package.json';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './platform/common/filters/http-exception.filter';
import { LoggingInterceptor } from './platform/common/interceptors/logging.interceptor';
import { BrokerLogger } from './platform/common/logging/broker-logger';
import { BootSummaryService } from './platform/common/boot/boot-summary.service';
import { TermGateway } from './modules/gateway/term.gateway';

async function bootstrap(): Promise<void> {
  const brokerLogger = new BrokerLogger();

  const app = await NestFactory.create(AppModule, {
    logger: brokerLogger,
  });

  // NOTE: no useWebSocketAdapter. @nestjs/platform-ws's WsAdapter routes upgrades
  // by EXACT pathname match, so it can never deliver the per-terminal URL
  // `/term/<terminalId>` to the gateway. Instead TermGateway owns its own raw
  // ws.Server({ noServer: true }) and is attached to the HTTP server's `upgrade`
  // event below (after listen, so getHttpServer() is the real listening server).

  const port = parseInt(process.env['DDX_TERM_BROKER_PORT'] ?? '6481', 10);
  const host = process.env['DDX_TERM_BROKER_HOST'] ?? '127.0.0.1';

  // Security — apply before any route handling.
  app.use(helmet());

  // CORS — origins provided via env; no hardcoded default in source.
  // Set CORS_ORIGINS in .env for dev (e.g. http://localhost:3000).
  const corsOrigins = (process.env['CORS_ORIGINS'] ?? '').split(',').filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });

  // Global REST prefix.
  app.setGlobalPrefix('api/v1');

  // Global exception filter (standardised error bodies).
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global request logging interceptor.
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger.
  const swaggerPath = 'api/docs';
  const swaggerConfig = new DocumentBuilder()
    .setTitle('DDX Term Broker API')
    .setDescription(
      'Terminal bridge broker — shared tmux session, terminal registry, WS fan-out',
    )
    .setVersion(APP_VERSION)
    .addServer(`http://localhost:${port}`, 'Development')
    .addTag('Session', 'Shared tmux session lifecycle + health')
    .addTag('Terminals', 'Per-terminal CRUD over tmux windows')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(swaggerPath, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(port, host);

  // Wire the per-terminalId WS upgrade handler onto the now-listening HTTP server.
  const httpServer = app.getHttpServer() as HttpServer;
  app.get(TermGateway).attachTo(httpServer);

  // Boot banner — rendered after listen() for a TRUE boot time reading.
  const bootSummary = app.get(BootSummaryService);
  bootSummary.setBannerConfig({
    appVersion: APP_VERSION,
    host,
    port,
    swaggerPath,
    startTime: brokerLogger.startTime,
  });
  bootSummary.renderAll();

  const logger = new Logger('Bootstrap');
  logger.log(
    `DDX Term Broker v${APP_VERSION} listening on http://${host}:${port}`,
  );
}

process.on('unhandledRejection', (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  process.stderr.write(`[unhandledRejection] ${msg}\n`);
});

process.on('uncaughtException', (err: Error) => {
  process.stderr.write(`[uncaughtException] ${err.message}\n`);
});

// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();
