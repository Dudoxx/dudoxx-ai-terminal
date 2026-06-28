/**
 * GatewayModule — WebSocket fan-out gateway (per-terminalId routing).
 * Imports SessionModule (registry resolver) and ControlModeModule (attach loop).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { Module } from '@nestjs/common';
import { TermGateway } from './term.gateway';
import { SessionModule } from '../session/session.module';
import { ControlModeModule } from '../control-mode/control-mode.module';

@Module({
  imports: [SessionModule, ControlModeModule],
  providers: [TermGateway],
  exports: [TermGateway],
})
export class GatewayModule {}
