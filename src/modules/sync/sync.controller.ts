import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { SyncService } from './sync.service';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { pushSchema, type PushDto } from './dto/push.dto';
import type { AuthAgent } from '@/modules/auth/types';

const LIMIT_DEFAUT = 200;
const LIMIT_MAX = 1000;

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('push')
  @HttpCode(200)
  push(
    @CurrentUser() agent: AuthAgent,
    @Body(new ZodValidationPipe(pushSchema)) dto: PushDto,
  ) {
    return this.sync.push(agent, dto);
  }

  @Get('pull')
  pull(
    @CurrentUser() agent: AuthAgent,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    const cursor = since ? BigInt(since) : 0n;
    const l = Math.min(Math.max(Number(limit) || LIMIT_DEFAUT, 1), LIMIT_MAX);
    return this.sync.pull(agent, cursor, l);
  }
}
