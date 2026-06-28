/**
 * SessionController — health + describe endpoints for the shared tmux session.
 *
 * GET /session         → SessionDescriptor (canonical dims + policies)
 * GET /session/health  → { healthy: boolean, sessionId, socketPath }
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SessionService } from './session.service';
import type { SessionDescriptor } from '@ddx/term-contract';

export interface HealthResponse {
  healthy: boolean;
  sessionId: string;
  socketPath: string;
}

@ApiTags('Session')
@Controller('session')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get()
  @ApiOperation({ summary: 'Get shared session descriptor (dims + policies)' })
  describe(): SessionDescriptor {
    return this.sessionService.getSessionDescriptor();
  }

  @Get('health')
  @ApiOperation({ summary: 'Check whether the shared tmux session is alive' })
  async health(): Promise<HealthResponse> {
    const desc = this.sessionService.getSessionDescriptor();
    const healthy = await this.sessionService.isHealthy();
    return {
      healthy,
      sessionId: desc.sessionId,
      socketPath: desc.socketPath,
    };
  }
}
