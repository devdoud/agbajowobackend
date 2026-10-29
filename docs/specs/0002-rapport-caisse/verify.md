# Verify: rapport de caisse · spec 0002 · updated 2026-10-29
_Steps derived from spec 0002 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Prérequis : Docker démarré ; pour les étapes sur l'API de dev, `npm run start:dev` sur une base seedée, et un jeton de superviseur (`POST /api/v1/auth/login`).

## Commands
- [x] `npm run test:int` → 5 suites et 33 tests au vert, dont `caisse` (11 tests) → AC-1 à AC-10, AC-12
- [x] `npx jest src/domain/caisse` → 12 tests au vert (jour du Bénin, bornes, tri, totaux) → AC-1, AC-3, AC-5, AC-6
- [x] `prisma migrate deploy` sur la base locale, puis `SELECT indexname FROM pg_indexes WHERE indexname LIKE '%agent_id_%'` → `versements_agent_id_paid_at_idx`, `avances_agent_id_date_avance_idx`, `retraits_agent_id_date_retrait_idx` présents → AC-11
- [x] Sur l'API de dev, `GET /api/v1/caisse/agents/<id d'un agent>` avec le jeton superviseur → 200, `fuseau` vaut `Africa/Porto-Novo`, `totaux.soldeAttendu` = `encaisse` − `decaisse`, montants en chaînes → AC-1, AC-4
- [x] Sur l'API de dev, `GET /api/v1/caisse` avec le jeton superviseur → 200, une ligne par agent actif ; même appel avec un jeton d'agent → 403 `FORBIDDEN` → AC-10
- [ ] Mutation : dans `src/domain/caisse.ts`, remplacer `DECALAGE_BENIN_MINUTES = 60` par `0`, puis `npm run test:int` → le test « range un mouvement selon le jour du Bénin » échoue ; remettre le code → AC-3 (le test attrape une vraie régression)

## Value sourcing
- [x] Jour par défaut : sans `?date`, `date` vaut `jourBenin(maintenant)` et un versement encaissé à l'instant apparaît → AC-8
- [x] Bornes du jour : un versement à `2026-10-19T23:30Z` compte pour le 20, un à `2026-10-20T23:30Z` pour le 21, un à `2026-10-19T22:59Z` pour le 19 → AC-3
- [x] Date future : demain au Bénin → 400 `VALIDATION_ERROR` ; `2026-02-30` et `29-10-2026` → 400 → AC-8
- [x] `encaisse` / `avances` / `retraitsNets` : 1500 + 1000 encaissés, 600 d'avance, retrait net 400 (brut 900) → `"2500"`, `"600"`, `"400"`, `decaisse` `"1000"`, solde `"1500"` ; le brut du retrait n'entre pas dans le décaissé → AC-1
- [x] `soldeNegatif` : un retrait net de 4500 seul → `soldeAttendu` `"-4500"`, `soldeNegatif` `true` → AC-5
- [x] `arriveeTardive` : versement daté du 20, reçu le 21 à 08:00 UTC → ligne tardive, `arriveesTardives` 1 → AC-6
- [x] Attribution : un versement fait par un superviseur sur le contrat d'un agent apparaît chez le superviseur, pas chez l'agent → AC-2
- [x] Membre d'une ligne : membre supprimé logiquement → la ligne reste, avec son membre → AC-7, AC-12
- [x] `agent.supprime` : un compte supprimé logiquement est lisible par un superviseur, avec `actif` `false` et `supprime` `true` → AC-9
- [x] Comptes de la synthèse : agent actif sans mouvement présent à zéro, agent désactivé qui a encaissé présent, agent désactivé sans mouvement absent, tri `Abdou`, `Béatrice`, `Zinsou` → AC-10
- [x] Égalité synthèse et détail : pour chaque ligne de la synthèse, `totaux`, `soldeNegatif` et `arriveesTardives` égalent le rapport détaillé → AC-4, AC-10
- [x] Portée : un `AGENT` sur le rapport d'un autre → 404 `NOT_FOUND` ; un id inconnu → 404 ; un id non uuid → 400 → AC-8, AC-9
- [x] Ordre des lignes : deux mouvements à la même `dateTerrain` sortent dans l'ordre `VERSEMENT`, `AVANCE`, `RETRAIT`, puis par `id` (test d'intégration « départage deux mouvements à la même heure ») → AC-7

## Acceptance-criteria coverage
- AC-1 : happy path, sourcing des totaux · AC-2 : attribution · AC-3 : bornes, mutation · AC-4 : happy path, égalité synthèse et détail · AC-5 : solde négatif · AC-6 : synchro tardive · AC-7 : happy path, membre supprimé, ordre · AC-8 : jour par défaut, dates refusées · AC-9 : portée, compte supprimé · AC-10 : synthèse, 403 · AC-11 : index en base · AC-12 : membre supprimé, aucune écriture (routes GET seulement)
