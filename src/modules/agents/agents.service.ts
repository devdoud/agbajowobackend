import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import { Prisma, type RoleAgent } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { genererMotDePasse } from '@/common/password';
import type { AuthAgent } from '@/modules/auth/types';
import type { CreerAgentDto } from './dto/creer-agent.dto';
import type { ModifierAgentDto } from './dto/modifier-agent.dto';

const CHAMPS_PUBLICS = {
  id: true,
  nom: true,
  telephone: true,
  role: true,
  actif: true,
  mustChangePassword: true,
  createdAt: true,
} satisfies Prisma.AgentSelect;

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Un ADMIN gère tous les rôles ; un SUPERVISEUR ne gère que des comptes AGENT. */
  private assertPeutAttribuerRole(acteur: AuthAgent, role: RoleAgent): void {
    if (acteur.role === 'ADMIN') return;
    if (acteur.role === 'SUPERVISEUR' && role === 'AGENT') return;
    throw new ForbiddenException(
      'Un superviseur ne peut gérer que des comptes agent.',
    );
  }

  async creer(acteur: AuthAgent, dto: CreerAgentDto) {
    this.assertPeutAttribuerRole(acteur, dto.role);

    const motDePasse = genererMotDePasse();
    try {
      const agent = await this.prisma.agent.create({
        data: {
          id: randomUUID(),
          nom: dto.nom,
          telephone: dto.telephone,
          passwordHash: await hash(motDePasse),
          role: dto.role,
          mustChangePassword: true,
        },
        select: CHAMPS_PUBLICS,
      });
      // Le mot de passe temporaire n'est renvoyé qu'ici, une seule fois.
      return { agent, motDePasseTemporaire: motDePasse };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Ce numéro de téléphone est déjà utilisé.');
      }
      throw error;
    }
  }

  liste() {
    return this.prisma.agent.findMany({
      where: { deletedAt: null },
      select: CHAMPS_PUBLICS,
      orderBy: { createdAt: 'asc' },
    });
  }

  async modifier(acteur: AuthAgent, id: string, dto: ModifierAgentDto) {
    const cible = await this.prisma.agent.findFirst({
      where: { id, deletedAt: null },
    });
    if (!cible) throw new NotFoundException('Agent introuvable');

    // Un superviseur ne peut agir que sur des comptes AGENT.
    if (acteur.role !== 'ADMIN' && cible.role !== 'AGENT') {
      throw new ForbiddenException(
        'Un superviseur ne peut gérer que des comptes agent.',
      );
    }
    if (dto.role) this.assertPeutAttribuerRole(acteur, dto.role);
    if (id === acteur.id && dto.actif === false) {
      throw new ForbiddenException(
        'Vous ne pouvez pas désactiver votre propre compte.',
      );
    }
    if (id === acteur.id && dto.role && dto.role !== cible.role) {
      throw new ForbiddenException(
        'Vous ne pouvez pas modifier votre propre rôle.',
      );
    }

    const data: Prisma.AgentUpdateInput = {};
    let motDePasseTemporaire: string | undefined;

    if (dto.role) data.role = dto.role;
    if (dto.actif !== undefined) data.actif = dto.actif;
    if (dto.reinitialiserMotDePasse) {
      motDePasseTemporaire = genererMotDePasse();
      data.passwordHash = await hash(motDePasseTemporaire);
      data.mustChangePassword = true;
    }

    const agent = await this.prisma.agent.update({
      where: { id },
      data,
      select: CHAMPS_PUBLICS,
    });

    // Désactivation ou réinitialisation : on coupe les sessions actives.
    if (dto.actif === false || dto.reinitialiserMotDePasse) {
      await this.prisma.refreshToken.updateMany({
        where: { agentId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return { agent, motDePasseTemporaire };
  }
}
