/**
 * CommonModule — cross-cutting providers: filters, interceptors, boot summary.
 * Global module; imported once in AppModule.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { Global, Module } from '@nestjs/common';
import { BootSummaryService } from './boot/boot-summary.service';

@Global()
@Module({
  providers: [BootSummaryService],
  exports: [BootSummaryService],
})
export class CommonModule {}
