import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '@/common/decorators/public.decorator';
import { PrismaService } from '@/prisma/prisma.service';

/** Au delà, la base est jugée injoignable (Supabase en pause, pooler saturé). */
const DELAI_BASE_MS = 3_000;

/**
 * Endpoint de santé public, utilisé pour le monitoring et les healthchecks
 * (décision Q16 : oui). Il vérifie aussi la base (spec 0004, mise en ligne AC-6),
 * pour qu'UptimeRobot voie une base en pause ou injoignable.
 */
@ApiTags('Santé')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @ApiOperation({
    summary: 'Santé de l’API',
    description:
      'Public, pour le monitoring et les healthchecks. Vérifie aussi la base (SELECT 1) : 503 si elle ne répond pas.',
  })
  @ApiResponse({
    status: 200,
    description: '{ status, service, database, timestamp, uptime }.',
  })
  @ApiResponse({
    status: 503,
    description: 'Base injoignable : database vaut "injoignable".',
  })
  @Public()
  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const baseOk = await this.baseRepond();
    if (!baseOk) res.status(503);
    return {
      status: baseOk ? 'ok' : 'degrade',
      service: 'agbajowo-api',
      database: baseOk ? 'ok' : 'injoignable',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
    };
  }

  private async baseRepond(): Promise<boolean> {
    let minuteur: NodeJS.Timeout | undefined;
    const delai = new Promise<false>((resoudre) => {
      minuteur = setTimeout(() => resoudre(false), DELAI_BASE_MS);
    });
    try {
      return await Promise.race([
        this.prisma.$queryRaw`SELECT 1`.then(() => true),
        delai,
      ]);
    } catch {
      return false;
    } finally {
      clearTimeout(minuteur);
    }
  }
}
