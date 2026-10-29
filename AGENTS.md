# Agbajowo backend

API de la plateforme de tontine Agbajowo (collecte de mises par des agents terrain, avances, retraits, relevés, synchronisation hors ligne). Le code, les commentaires et les commits sont en français.

## Stack

- **Language / Runtime**: TypeScript 5 (strict), Node 22
- **Framework**: NestJS 11 (Express)
- **Key dependencies**: Prisma 6 + PostgreSQL 16, Zod (validation des DTO et de l'env), @nestjs/jwt + @node-rs/argon2, @nestjs/throttler, helmet
- **Package manager**: npm
- **Déploiement**: Docker (`Dockerfile`, `docker-compose.prod.yml`) derrière Caddy (HTTPS), CI GitHub Actions (lint, format, build, test)

## Build approach

<TBD, set by /scope>

## Commands

```bash
# Install
npm ci
# Base locale (Postgres seul) puis migrations et données de démo
docker compose up -d && npm run prisma:deploy && npm run prisma:seed
# Dev server (http://localhost:3001/api/v1)
npm run start:dev
# Build
npm run build
# Test (Jest, specs à côté du code) puis vérifs de la CI
npm test && npm run lint:ci && npm run format:check
# Smoke test de bout en bout (API démarrée + base seedée)
npm run smoke
# Nouvelle migration
npm run prisma:migrate -- --name <nom>
```

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title.md`.

## Rules

- Un module Nest par domaine métier dans `src/modules/<nom>/` : `<nom>.controller.ts`, `<nom>.service.ts`, `<nom>.module.ts`, `dto/<verbe>-<objet>.dto.ts`. Noms métier en français (`encaisser`, `souscrire`, `CreerMembreDto`).
- Un DTO est un schéma Zod plus son type inféré (`xxxSchema` + `type XxxDto = z.infer<...>`), validé par `@Body(new ZodValidationPipe(xxxSchema))`. Pas de class-validator.
- Les règles de calcul vivent en fonctions pures dans `src/domain/` (testées). Les services lisent Prisma, convertissent, appellent le domaine, puis écrivent. Voir [src/domain/AGENTS.md](src/domain/AGENTS.md).
- Toute route est protégée par défaut (guards globaux JWT puis rôles). `@Public()` pour ouvrir, `@Roles(...)` pour restreindre, `@CurrentUser()` pour l'agent courant.
- Portée par rôle : un `AGENT` ne voit que ses données (`ownerId` / `agentId`), `SUPERVISEUR` et `ADMIN` voient tout. Les comptes agents : l'ADMIN gère tous les rôles, un SUPERVISEUR ne voit et ne gère que des comptes `AGENT`.
- Erreurs : lever des `HttpException` Nest ; une règle métier violée donne `UnprocessableEntityException({ code: 'BUSINESS_RULE', message })`. Le filtre global renvoie toujours `{ code, message, details?, requestId }`.
- Montants en FCFA entiers : `BigInt` en base (sérialisé en chaîne dans le JSON), `number` dans le domaine. Suppression logique via `deletedAt`, à filtrer (`deletedAt: null`).
- Imports internes via l'alias `@/` (`@/prisma/prisma.service`). Prettier : guillemets simples, virgules finales.
- Commits en Conventional Commits, en français : `feat(membre): ...`, `fix(retrait): ...`.

## Gotchas

- L'env est validé au démarrage (`src/config/env.validation.ts`) : `DATABASE_URL` et deux secrets JWT d'au moins 16 caractères sont requis, sinon l'API refuse de démarrer. Copier `.env.example` en `.env`.
- Écritures qui créent un mouvement : idempotentes (clé `idempotencyKey` / `id` client) et dans une `$transaction`. Les numéros (reçu, membre, agent, `server_seq`) viennent de séquences Postgres créées en SQL dans les migrations, pas dans le schéma Prisma.
- En conteneur, `docker-entrypoint.sh` lance `prisma migrate deploy` avant l'API.

## Agent skills

- [nestjs-best-practices](.agents/skills/nestjs-best-practices/): `kadajett/agent-nestjs-skills`, modules, injection, sécurité et performance NestJS
- [prisma-client-api](.agents/skills/prisma-client-api/): `prisma/skills`, API de requêtes Prisma et `$transaction` (écrit pour Prisma 7, le projet est en Prisma 6)
- [prisma-postgres](.agents/skills/prisma-postgres/): `prisma/skills`, Prisma avec PostgreSQL
- [javascript-typescript-jest](.agents/skills/javascript-typescript-jest/): `github/awesome-copilot`, tests Jest en TypeScript

## Context files

- [src/domain/AGENTS.md](src/domain/AGENTS.md): règles métier pures (commission, crédit, retrait, statut, relevé), sans Nest ni Prisma
- [src/modules/sync/AGENTS.md](src/modules/sync/AGENTS.md): synchronisation hors ligne push/pull de l'app agent (curseur `server_seq`, conflits)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
