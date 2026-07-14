/**
 * GatewayModule — WebSocket fan-out gateway (per-terminalId routing).
 * Imports SessionModule (registry resolver), ControlModeModule (attach loop),
 * and TerminalModule (snapshotWithScrollback for the cold-attach repaint push).
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { Module } from '@nestjs/common';
import { TermGateway } from './term.gateway';
import { SessionModule } from '../session/session.module';
import { ControlModeModule } from '../control-mode/control-mode.module';
import { TerminalModule } from '../terminal/terminal.module';

@Module({
  imports: [SessionModule, ControlModeModule, TerminalModule],
  providers: [TermGateway],
  exports: [TermGateway],
})
export class GatewayModule {}
