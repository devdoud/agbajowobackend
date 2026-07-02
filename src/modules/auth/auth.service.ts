import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { hash, verify } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import type { Agent } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type { Env } from '@/config/env.validation';
import type { AccessPayload, RefreshPayload } from './types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Hache un mot de passe (Argon2id). Utilisé aussi par le seed. */
  hashPassword(password: string): Promise<string> {
    return hash(password);
  }

  async login(telephone: string, password: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { telephone, actif: true, deletedAt: null },
    });
    // On vérifie toujours un hash (même agent absent) pour limiter l'énumération.
    const ok = agent
      ? await verify(agent.passwordHash, password).catch(() => false)
      : false;
    if (!agent || !ok) {
      throw new UnauthorizedException('Identifiants invalides');
    }
    return this.issueTokens(agent);
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyRefresh(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
    });
    if (
      !record ||
      record.revokedAt ||
      record.agentId !== payload.sub ||
      record.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Session expirée');
    }
    const agent = await this.prisma.agent.findFirst({
      where: { id: payload.sub, actif: true, deletedAt: null },
    });
    if (!agent) throw new UnauthorizedException('Session invalide');

    // Rotation : on révoque le jeton utilisé et on en émet un nouveau.
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(agent);
  }

  async logout(refreshToken: string): Promise<void> {
    const payload = await this.verifyRefresh(refreshToken).catch(() => null);
    if (payload) {
      await this.prisma.refreshToken.updateMany({
        where: { id: payload.jti, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  async me(agentId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, nom: true, telephone: true, role: true },
    });
    if (!agent) throw new UnauthorizedException();
    return agent;
  }

  private async issueTokens(agent: Agent) {
    const accessTtl = this.config.get('JWT_ACCESS_TTL', { infer: true });
    const refreshTtl = this.config.get('JWT_REFRESH_TTL', { infer: true });
    const jti = randomUUID();

    await this.prisma.refreshToken.create({
      data: {
        id: jti,
        agentId: agent.id,
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    const accessPayload: AccessPayload = {
      sub: agent.id,
      role: agent.role,
      type: 'access',
    };
    const refreshPayload: RefreshPayload = {
      sub: agent.id,
      jti,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: accessTtl,
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
        expiresIn: refreshTtl,
      }),
    ]);

    return {
      accessToken,
      accessExpiresIn: accessTtl,
      refreshToken,
      refreshExpiresIn: refreshTtl,
      agent: {
        id: agent.id,
        nom: agent.nom,
        telephone: agent.telephone,
        role: agent.role,
      },
    };
  }

  private async verifyRefresh(token: string): Promise<RefreshPayload> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshPayload>(token, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      });
      if (payload.type !== 'refresh') throw new Error('type');
      return payload;
    } catch {
      throw new UnauthorizedException('Jeton de rafraîchissement invalide');
    }
  }
}
