# Verify: pilotage terrain · spec 0005 · updated 2026-10-30

_Steps derived from spec 0005 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Prérequis : Docker démarré pour `npm run test:int` (ou un PostgreSQL local, voir plus bas) ; pour les étapes sur l'API, un jeton (`POST /api/v1/auth/login`).

## Commands

- [x] `npx jest src/domain/date-terrain src/domain/caisse` → `ecartHorloge`, `corrigerDateTerrain`, `joursDeLaSerie`, `remplirSerie` au vert → AC-3, AC-4, AC-9
- [x] `npm test` → 22 suites, 172 tests au vert
- [x] Suite d'intégration complète contre PostgreSQL (lancée le 2026-10-30 sur un PostgreSQL 18 local, Docker étant arrêté) → 15 suites, 101 tests au vert, dont `pilotage` (10 tests) → AC-1 à AC-10
- [ ] `npm run test:int` en CI (PostgreSQL 16 de Testcontainers) → au vert
- [ ] En prod après déploiement : `GET /api/v1/dashboard/serie` → 200, 14 points → AC-9
- [ ] En prod : `GET /api/v1/membres/verifier-telephone?telephone=1234` → 400 → AC-7

## Value sourcing

- [x] `derniereSyncA` vaut l'heure figée du test (`2026-10-30T11:00:00.000Z`) après un pull, puis après un push vide → AC-1
- [x] Téléphone en avance de 2 h, versement daté 5 min avant l'envoi : `paid_at` = heure serveur − 5 min, `ecart_horloge_s` = −7200 → AC-3
- [x] Écart de 10 min : `paid_at` inchangé, `ecart_horloge_s` null → AC-4
- [x] Rejeu du même `id` avec un téléphone en retard de 2 h : `paid_at` et `ecart_horloge_s` (−7200) inchangés → AC-5
- [x] `GET /caisse/agents/:id` : la ligne du versement corrigé porte `ecartHorlogeS: -7200` → AC-6
- [x] Versement à `2026-10-29T22:30:00Z` (23:30 au Bénin) compté le 29 dans la courbe → AC-9

## Acceptance-criteria coverage

- AC-1 : pilotage (dernière synchro) · AC-2 : `horlogeClient` mal formé (400), avance de 2 h · AC-3 : avance de 2 h · AC-4 : sans `horlogeClient` (conflit), écart de 10 min · AC-5 : rejeu avec une autre horloge, date et écart inchangés · AC-6 : `ecartHorlogeS` lu dans `GET /caisse/agents/:id` (versement testé ; avance et retrait reçoivent le même champ) · AC-7, AC-8 : doublons (agent, superviseur, inconnu, trop court) · AC-9, AC-10 : courbe (3 jours, 14 par défaut, 404, 400, superviseur) · AC-11 : migration `20261030180000_pilotage_terrain`
