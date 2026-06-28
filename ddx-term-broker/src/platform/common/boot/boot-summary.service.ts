/**
 * BootSummaryService — renders a one-table boot banner after listen().
 * Mirrors ddx-api BootSummaryService; stripped of Prisma/FHIR subsystems.
 *
 * Dudoxx UG / Acceleate Consulting - Walid Boudabbous <walid@acceleate.com>
 */

import { Injectable, Logger } from '@nestjs/common';

export type SubsystemStatus = 'ok' | 'warn' | 'disabled' | 'info';

export interface SubsystemEntry {
  section: string;
  status: SubsystemStatus;
  detail: string;
}

export interface BootBannerConfig {
  appVersion: string;
  host: string;
  port: number;
  swaggerPath: string;
  startTime: number;
}

@Injectable()
export class BootSummaryService {
  private readonly logger = new Logger('Bootstrap');
  private readonly entries = new Map<string, SubsystemEntry>();
  private bannerConfig: BootBannerConfig | null = null;

  register(section: string, status: SubsystemStatus, detail: string): void {
    this.entries.set(section, { section, status, detail });
  }

  setBannerConfig(config: BootBannerConfig): void {
    this.bannerConfig = config;
  }

  renderAll(): void {
    this.renderSubsystems();
    this.renderBanner();
  }

  private renderSubsystems(): void {
    if (this.entries.size === 0) return;
    this.logger.log('--- Subsystems ---');
    for (const e of this.entries.values()) {
      const icon =
        e.status === 'ok'
          ? 'OK  '
          : e.status === 'warn'
            ? 'WARN'
            : e.status === 'disabled'
              ? 'OFF '
              : 'INFO';
      this.logger.log(`  [${icon}] ${e.section}: ${e.detail}`);
    }
  }

  private renderBanner(): void {
    if (!this.bannerConfig) {
      this.logger.warn('setBannerConfig() not called before renderAll()');
      return;
    }
    const { appVersion, host, port, swaggerPath, startTime } =
      this.bannerConfig;
    const bootMs = Date.now() - startTime;
    this.logger.log('----------------------------------------');
    this.logger.log(
      `  DDX TERM BROKER v${appVersion}  —  http://${host}:${port}`,
    );
    this.logger.log(`  Swagger: http://localhost:${port}/${swaggerPath}`);
    this.logger.log(`  Boot: ${bootMs}ms`);
    this.logger.log('----------------------------------------');
  }
}
