/**
 * TerminalModule — per-terminal REST CRUD over tmux windows.
 * Imports SessionModule so TerminalService can delegate registry writes.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { Module } from '@nestjs/common';
import { TerminalService } from './terminal.service';
import { TerminalController } from './terminal.controller';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [SessionModule],
  providers: [TerminalService],
  controllers: [TerminalController],
  exports: [TerminalService],
})
export class TerminalModule {}
