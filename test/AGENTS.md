# Tests d'intégration

## Overview

Tests HTTP de la vraie application NestJS contre un PostgreSQL 16 jetable, démarré par Testcontainers pour chaque lancement. Ils prouvent ce que les tests unitaires de `src/` ne voient pas : guards, validation Zod, filtre d'erreurs, transactions Prisma, contraintes et séquences Postgres.

## Key files

| File | Owns |
|---|---|
| `jest-int.json` | Config Jest de la suite (indépendante de la clé `jest` du `package.json`) |
| `support/global-setup.ts` | Démarre le conteneur, applique `prisma migrate deploy`, pose `DATABASE_URL` et `TEST_DATABASE_URL` |
| `support/global-teardown.ts` | Arrête le conteneur |
| `support/setup-env.ts` | Variables d'env de test (secrets JWT, TTL, `MEDIA_DIR` temporaire), prioritaires sur le `.env` local |
| `support/app.ts` | `creerAppDeTest` (app configurée par `configurerApp`, limite de débit neutralisée par défaut), `seConnecter` (vrai login), `corps<T>()` |
| `support/base.ts` | `viderBase` : `TRUNCATE` de toutes les tables, avec garde fou sur l'URL et le nom de base |
| `support/fabriques.ts` | `creerAgent`, `creerMembre`, `creerContrat` avec valeurs par défaut valides et surchargeables |
| `integration/*.int-spec.ts` | Les tests, un fichier par module ou par sujet |

## Commands

```bash
npm run test:int                                        # toute la suite (Docker démarré)
npx jest --config test/jest-int.json --runInBand collecte   # un seul fichier (filtre par nom, pas par chemin sous Windows)
```

## Conventions

- Fichiers `test/integration/<sujet>.int-spec.ts` ; jamais `*.spec.ts` ici (ce suffixe est réservé aux tests unitaires de `src/`, lancés par `npm test`).
- Par fichier : `creerAppDeTest()` dans `beforeAll`, `viderBase(ctx.prisma)` dans `beforeEach`, `ctx.app.close()` dans `afterAll` (sinon Jest ne s'arrête pas).
- Chaque test crée ses propres données via les fabriques ; ne jamais dépendre du seed ni d'un autre test.
- Passer par HTTP et le vrai login (`seConnecter`), puis vérifier aussi l'état en base via `ctx.prisma` quand l'AC le demande.
- Typer les corps de réponse avec `corps<T>(res)` (supertest les type `any`, refusé par le lint).
- Titres de test en français, avec l'`AC-N` du spec couvert.

## Gotchas

- Les séquences (`receipt_seq`, `sync_seq`…) ne sont pas remises à zéro : vérifier le format d'un numéro, jamais sa valeur exacte.
- La limite de débit est neutralisée par défaut ; `creerAppDeTest({ limiteDeDebit: true })` la garde active.
- Le premier lancement télécharge l'image `postgres:16-alpine` (délai de démarrage de 180 secondes).

## Related specs

- [0001 · Tests d'intégration sur un Postgres jetable](../docs/specs/0001-tests-integration-postgres/index.md)

_Drafted by /sync from the introducing change, worth a quick human pass._
