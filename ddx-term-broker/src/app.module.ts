/**
 * AppModule — root module wiring for ddx-term-broker.
 * Domain modules: session (B3), terminal + control-mode + gateway (B4).
 * Platform: CommonModule (global filters, boot summary).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { Module } from '@nestjs/common';
import { CommonModule } from './platform/common/common.module';
import { SessionModule } from './modules/session/session.module';
import { TerminalModule } from './modules/terminal/terminal.module';
import { ControlModeModule } from './modules/control-mode/control-mode.module';
import { GatewayModule } from './modules/gateway/gateway.module';

@Module({
  imports: [
    CommonModule,
    SessionModule,
    TerminalModule,
    ControlModeModule,
    GatewayModule,
  ],
})
export class AppModule {}
