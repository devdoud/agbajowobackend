# Verify: règles des dates terrain · spec 0003 · updated 2026-10-29
_Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Prérequis : Docker démarré ; pour les étapes sur l'API de dev, `npm run build` puis l'API démarrée sur la base seedée, et un jeton (`POST /api/v1/auth/login`).

## Commands
- [x] `npx jest src/domain/date-terrain` → 37 tests au vert (format, dates impossibles, bornes exactes, messages) → AC-1, AC-3, AC-4, AC-5, AC-10, AC-11
- [x] `npm run test:int` → 6 suites et 67 tests au vert, dont `dates-terrain` (21 tests, horloge figée au 2026-10-29T12:00Z) → AC-1 à AC-9, AC-11
- [x] `npm run smoke` sur l'API de dev → « push : 1 membre + 1 contrat + 1 versement, 0 conflit » au vert avec `paidAt` envoyé → AC-7 (l'échec « retrait partiel : net 500 » existait avant ce travail, voir plus bas)
- [x] Sur l'API de dev, `POST /api/v1/versements` avec `"paidAt": null` → 400 `VALIDATION_ERROR`, rien en base → AC-1
- [x] Sur l'API de dev, `POST /api/v1/versements` avec `paidAt` à demain → 422 `BUSINESS_RULE`, message « Date terrain dans le futur : au plus 15 minutes après l'heure du serveur. » → AC-3, AC-11
- [x] Sur l'API de dev, `POST /api/v1/sync/push` avec un versement valide et un versement sans `paidAt` → 200, un appliqué, un conflit « Date terrain manquante. » → AC-6, AC-7

## Value sourcing
- [x] Date par défaut en direct : sans `paidAt`, le versement porte l'heure de `ClockService` (`2026-10-29T12:00:00.000Z` avec l'horloge figée) → AC-2
- [x] Tolérance future : `maintenant + 15 min` accepté, `+ 1 ms` refusé → AC-3
- [x] Ancienneté : `maintenant − 30 j` accepté, `− 1 ms` refusé → AC-4
- [x] Début du contrat : `2026-10-19T22:59:59Z` refusé avec « (2026-10-20) », `2026-10-19T23:00:00Z` (minuit au Bénin) accepté → AC-5
- [x] Jour du Bénin et fuseau : `2026-10-28T23:30:00+01:00` enregistré `2026-10-28T22:30:00.000Z` → AC-9
- [x] Raison d'un conflit : lot mixte → raisons « invalide » (versement `null`), « dans le futur » (avance), « manquante » (retrait) → AC-6, AC-11
- [x] Rejeu d'une date illisible : un versement poussé puis repoussé sans date avec le même `id` → appliqué, aucun conflit, un seul en base → AC-8

## Acceptance-criteria coverage
- AC-1 : domaine, 8 cas HTTP, avance `null`, retrait sans fuseau · AC-2 : date par défaut · AC-3 : bornes futures, avance future · AC-4 : bornes anciennes, retrait à 31 j · AC-5 : début du contrat, contrat qui commence demain · AC-6 : lot mixte · AC-7 : retrait sans date en synchro, smoke · AC-8 : rejeu direct hors bornes, rejeu synchro sans date · AC-9 : `+01:00` · AC-10 : `src/domain/date-terrain.ts` utilisé par les trois services et la synchro · AC-11 : messages vérifiés au domaine et en HTTP
- Hors spec : `scripts/smoke.mjs` attend « retrait partiel : net 500 » alors que la règle R9 déduit l'avance de 10 000 et donne 0 récupérable (422). Échec antérieur à ce travail, à corriger dans le script.
