import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';

/** Route d'accueil de l'API (racine du préfixe `/api/v1`). */
@ApiTags('Santé')
@Controller()
export class AppController {
  @ApiOperation({
    summary: 'Accueil de l’API',
    description: 'Public. Liste quelques points d’entrée.',
  })
  @ApiResponse({
    status: 200,
    description: '{ service, status, version, endpoints }.',
  })
  @Public()
  @Get()
  index() {
    return {
      service: 'agbajowo-api',
      status: 'ok',
      version: 'v1',
      endpoints: {
        health: '/api/v1/health',
        login: '/api/v1/auth/login',
        membres: '/api/v1/membres',
        dashboard: '/api/v1/dashboard/stats',
        sync: '/api/v1/sync/pull',
      },
    };
  }
}
