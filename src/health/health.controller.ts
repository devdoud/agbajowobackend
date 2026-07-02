import { Controller, Get } from '@nestjs/common';
import { Public } from '@/common/decorators/public.decorator';

/**
 * Endpoint de santé public, utilisé pour le monitoring du VPS et les healthchecks
 * Docker (décision Q16 : oui).
 */
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'agbajowo-api',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
    };
  }
}
