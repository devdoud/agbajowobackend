import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/public.decorator';

/**
 * Endpoint de santé public, utilisé pour le monitoring du VPS et les healthchecks
 * Docker (décision Q16 : oui).
 */
@ApiTags('Santé')
@Controller('health')
export class HealthController {
  @ApiOperation({
    summary: 'Santé de l’API',
    description: 'Public, pour le monitoring et les healthchecks Docker.',
  })
  @ApiResponse({
    status: 200,
    description: '{ status, service, timestamp, uptime }.',
  })
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
