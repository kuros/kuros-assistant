import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@kuros/shared';

@Controller('health')
export class HealthController {
  private readonly bootedAt = Date.now();

  @Get()
  health(): HealthResponse {
    return {
      ok: true,
      version: process.env.npm_package_version ?? '0.0.1',
      uptimeSec: Math.floor((Date.now() - this.bootedAt) / 1000),
    };
  }
}
