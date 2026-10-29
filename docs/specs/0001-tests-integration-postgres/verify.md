# Verify: tests d'intégration sur Postgres · spec 0001 · updated 2026-10-29
_Steps derived from spec 0001 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Prérequis : Docker Desktop démarré.

## Commands
- [x] `npm run test:int` → démarre un Postgres 16 jetable, applique les 8 migrations, 2 suites et 9 tests au vert, code de sortie 0 → AC-1
- [x] `docker ps` juste après `npm run test:int` → aucun conteneur de test restant (seule la base de dev `agbajowo-postgres` peut tourner) → AC-1
- [x] `npm test` avec Docker arrêté → seules les specs unitaires de `src/` tournent, au vert, aucun `*.int-spec.ts` ramassé → AC-2
- [x] Lancer `npm run test:int` deux fois de suite → au vert les deux fois (aucun test ne dépend d'un autre ni d'un lancement précédent) → AC-3
- [x] `DATABASE_URL` forcé vers une autre base dans un test qui appelle `viderBase` → refus « viderBase refusé » avant tout `TRUNCATE` → AC-3 (garde fou)
- [x] `npm run start:dev`, puis `curl -i localhost:3001/api/v1/health` → 200, en tête `X-Request-Id` présent, en têtes helmet présents (prod inchangée après `configurerApp`) → AC-4
- [x] `curl` d'une route qui renvoie un `BigInt` (par exemple un versement) sur l'API de dev → montants en chaînes, pas d'erreur de sérialisation → AC-4
- [x] Sur l'API de dev, 11 `POST /api/v1/auth/login` en moins d'une minute → le 11e renvoie 429 `RATE_LIMITED` (la limite reste active en prod malgré `useExisting`) → AC-5, AC-6
- [x] `DOCKER_HOST=tcp://127.0.0.1:1 npm run test:int` → échec immédiat avec « Docker est introuvable ou arrêté… », code de sortie non nul → AC-11
- [x] Pousser une branche et ouvrir une PR → l'étape « Tests d'intégration (PostgreSQL via Testcontainers) » tourne après « Tests » et passe → AC-12
- [x] Mutation : changer `> contrat.targetMises` en `> contrat.targetMises + 1000` dans `collecte.service.ts`, puis `npm run test:int` → le test « refuse un versement qui dépasse l'objectif » échoue ; remettre le code → AC-9 (la suite attrape une vraie régression)

## Value sourcing
- [x] URL de la base : le log de migration affiche `localhost:<port aléatoire>` et la base `test`, jamais `5432` ni `agbajowo` → valeur « URL de la base de test »
- [x] Secrets et TTL : un `.env` local avec un `JWT_ACCESS_TTL` différent ne change pas le résultat de `npm run test:int` → valeur « secrets JWT, TTL et MEDIA_DIR »
- [x] Montant : `misesCount` 3 × `miseAmount` 500 → `amount` vaut `"1500"` en réponse et `1500n` en base → AC-7
- [x] Plage de mises : un deuxième versement de 2 mises après 3 → `numeroMiseDebut` 4, `numeroMiseFin` 5 → AC-7
- [ ] Reçu : format `REC-AAAAMMJJ-NNNNN`, la date suit l'heure locale du serveur ; vérifier aussi un lancement juste après minuit si possible → AC-7
- [x] `targetMises` à 5 : 5 mises passent le contrat en `TERMINE`, 6 mises donnent 422 sans écriture → AC-9
- [x] `statut` `SUSPENDU` → 422 `BUSINESS_RULE` → AC-9
- [x] Même `id` envoyé deux fois → même `id` et même `receiptNumber`, `versement.count()` à 1 → AC-8
- [x] `requestId` : envoyer l'en tête `X-Request-Id: abc` sur une requête en erreur → le corps renvoie `requestId: "abc"` → AC-10
- [x] Seuil de la limite : 10 logins passent, le 11e est refusé (valeur tirée du `@Throttle` de `auth.controller.ts`) → AC-6

## Acceptance-criteria coverage
- AC-1 : steps 1, 2 · AC-2 : step 3 · AC-3 : steps 4, 5 · AC-4 : steps 6, 7 · AC-5 : step 8 et suite collecte · AC-6 : step 8, test `limite-debit` · AC-7 : test nominal, sourcing montant, plage, reçu · AC-8 : test idempotence · AC-9 : tests objectif, mutation · AC-10 : tests 401, 400, 404, sourcing `requestId` · AC-11 : step 9 · AC-12 : step 10
