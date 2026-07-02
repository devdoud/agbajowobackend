import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService, type Periode } from './dashboard.service';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { StatutCollecte } from '@/domain/types';
import type { AuthAgent } from '@/modules/auth/types';

const PERIODES: Periode[] = ['today', 'yesterday', 'week', 'month', 'custom'];

function parsePeriode(value?: string): Periode {
  return PERIODES.includes(value as Periode) ? (value as Periode) : 'today';
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('stats')
  stats(
    @CurrentUser() agent: AuthAgent,
    @Query('period') period?: string,
    @Query('date') date?: string,
  ) {
    return this.dashboard.stats(agent, parsePeriode(period), date);
  }

  @Get('file')
  file(
    @CurrentUser() agent: AuthAgent,
    @Query('period') period?: string,
    @Query('statut') statut?: StatutCollecte,
    @Query('q') q?: string,
    @Query('date') date?: string,
  ) {
    return this.dashboard.file(agent, parsePeriode(period), statut, q, date);
  }
}
