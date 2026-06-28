/**
 * ControlModeModule — tmux -CC attach + incremental frame parser.
 * Exports ControlModeAttach so GatewayModule can subscribe to frame events.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { Module } from '@nestjs/common';
import { ControlModeAttach } from './control-mode.attach';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [SessionModule],
  providers: [ControlModeAttach],
  exports: [ControlModeAttach],
})
export class ControlModeModule {}
