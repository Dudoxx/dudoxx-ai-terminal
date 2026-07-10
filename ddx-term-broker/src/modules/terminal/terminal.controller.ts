/**
 * TerminalController — REST CRUD for the terminal registry.
 *
 * POST   /api/v1/terminals          → create terminal (allocates tmux window)
 * GET    /api/v1/terminals          → list all terminals
 * GET    /api/v1/terminals/:id      → get one terminal + refresh snapshot
 * GET    /api/v1/terminals/:id/snapshot → capture visible viewport
 * DELETE /api/v1/terminals/:id      → destroy terminal
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  HttpException,
  PipeTransform,
  BadRequestException,
  type ArgumentMetadata,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiParam, ApiBody } from '@nestjs/swagger';
import { z } from 'zod/v4';
import { TerminalService, type SnapshotResult } from './terminal.service';
import { TerminalLimitError } from '../session/session.service';
import type { TerminalDescriptor } from '@ddx/term-contract';

/** Bound POST /terminals body — title is optional but capped at 64 chars. */
const CreateTerminalBodySchema = z.object({
  title: z.string().max(64).optional(),
});

type CreateTerminalBody = z.infer<typeof CreateTerminalBodySchema>;

/** Bound PATCH /terminals/:id body — title is REQUIRED, trimmed, 1-64 chars. */
const RenameTerminalBodySchema = z.object({
  title: z.string().trim().min(1).max(64),
});

type RenameTerminalBody = z.infer<typeof RenameTerminalBodySchema>;

/** Inline Zod validation pipe — validates and returns the parsed value. */
class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(value: unknown, _meta: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(result.error.issues);
    }
    return result.data;
  }
}

@ApiTags('Terminals')
@Controller('terminals')
export class TerminalController {
  constructor(private readonly terminalService: TerminalService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new terminal (allocates a tmux window)' })
  @ApiBody({ schema: { type: 'object', properties: { title: { type: 'string', maxLength: 64 } } } })
  async create(
    @Body(new ZodPipe(CreateTerminalBodySchema)) body: CreateTerminalBody,
  ): Promise<TerminalDescriptor> {
    try {
      return await this.terminalService.create({ title: body.title });
    } catch (err) {
      // Cap reached → 429 Too Many Requests (retriable after a destroy). Other
      // errors propagate to the global HttpExceptionFilter unchanged.
      if (err instanceof TerminalLimitError) {
        throw new HttpException(err.message, HttpStatus.TOO_MANY_REQUESTS);
      }
      throw err;
    }
  }

  @Get()
  @ApiOperation({ summary: 'List all registered terminals' })
  list(): TerminalDescriptor[] {
    return this.terminalService.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get terminal descriptor with refreshed PID snapshot' })
  @ApiParam({ name: 'id', description: 'terminalId (e.g. term-build, t01)' })
  get(@Param('id') id: string): Promise<TerminalDescriptor> {
    return this.terminalService.get(id);
  }

  @Get(':id/snapshot')
  @ApiOperation({ summary: 'Capture the visible viewport grid (term_snapshot)' })
  @ApiParam({ name: 'id', description: 'terminalId' })
  snapshot(@Param('id') id: string): Promise<SnapshotResult> {
    return this.terminalService.snapshot(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a terminal (tmux rename-window; identity unchanged)' })
  @ApiParam({ name: 'id', description: 'terminalId' })
  @ApiBody({ schema: { type: 'object', required: ['title'], properties: { title: { type: 'string', minLength: 1, maxLength: 64 } } } })
  rename(
    @Param('id') id: string,
    @Body(new ZodPipe(RenameTerminalBodySchema)) body: RenameTerminalBody,
  ): Promise<TerminalDescriptor> {
    return this.terminalService.rename(id, body.title);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Destroy a terminal (kill-window + clear registry)' })
  @ApiParam({ name: 'id', description: 'terminalId' })
  async destroy(@Param('id') id: string): Promise<void> {
    await this.terminalService.destroy(id);
  }
}
