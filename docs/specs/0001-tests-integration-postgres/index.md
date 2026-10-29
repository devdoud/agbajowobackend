# 0001. Tests d'intégration sur un Postgres jetable

**Date**: 2026-10-29
**Status**: Accepted

## Summary

On ajoute une suite de tests d'intégration qui lance la vraie application NestJS contre une vraie base PostgreSQL 16, démarrée à la volée dans un conteneur Docker jetable (Testcontainers). Aujourd'hui, seules les règles pures du domaine sont testées : rien ne prouve que l'auth, la validation, Prisma et les transactions marchent ensemble. Cette première livraison pose le harnais et prouve un seul fil complet, l'encaissement d'un versement, via `npm run test:int`, en local comme dans la CI. Le retrait, la concurrence et les autres modules viendront ensuite sur ce même harnais.

## Requirements

**User stories**:
- En tant que développeur, je veux lancer `npm run test:int` et voir l'encaissement testé de bout en bout contre une vraie base, pour savoir avant le pilote que l'argent encaissé est bien enregistré.
- En tant que développeur, je veux que la CI refuse une modification qui casse ce fil, pour ne jamais livrer un encaissement cassé.
- En tant que développeur, je veux des fabriques de données et des helpers réutilisables, pour écrire en quelques lignes les tests des fonctions suivantes (retrait, rapport de caisse, journal d'audit).

**Acceptance criteria**:
- **AC-1**: `npm run test:int` démarre un Postgres 16 jetable via Testcontainers, applique toutes les migrations Prisma (`prisma migrate deploy`), lance les fichiers `test/integration/**/*.int-spec.ts` en série, puis arrête le conteneur, en local comme dans la CI.
- **AC-2**: `npm test` reste inchangé : il ne lance que les specs unitaires de `src/`, sans Docker, et ne ramasse aucun fichier `*.int-spec.ts`.
- **AC-3**: Avant chaque test, toutes les tables de la base de test sont vidées (sauf `_prisma_migrations`) ; aucun test ne dépend des données d'un autre test, quel que soit l'ordre.
- **AC-4**: L'app de test est configurée par la même fonction que la prod (`configurerApp`) : préfixe `api/v1`, filtre d'erreurs global, `BigInt` sérialisés en chaîne.
- **AC-5**: Les requêtes de test s'authentifient par un vrai `POST /api/v1/auth/login` sur un agent créé par une fabrique, et la limite de débit est neutralisée pour la suite, pour qu'aucun test n'échoue en 429.
- **AC-6**: Un test dédié prouve que la limite de débit existe toujours : sur une app sans neutralisation, le 11e login dans la même minute renvoie 429 `RATE_LIMITED`.
- **AC-7**: Encaissement nominal : `POST /api/v1/versements` sur un contrat actif renvoie 201 ; le montant vaut `misesCount × miseAmount` (renvoyé en chaîne) ; `numeroMiseDebut` et `numeroMiseFin` suivent le cumul déjà versé ; le reçu respecte le format `REC-AAAAMMJJ-NNNNN` ; le versement existe en base.
- **AC-8**: Idempotence : renvoyer la même requête avec le même `id` renvoie le même versement (même `id`, même reçu), et il n'existe qu'une seule ligne en base.
- **AC-9**: Objectif et statut : un versement qui atteint exactement `targetMises` passe le contrat en `TERMINE` ; un versement qui dépasse l'objectif renvoie 422 `BUSINESS_RULE` sans rien écrire ; un encaissement sur un contrat au statut `SUSPENDU` renvoie 422 `BUSINESS_RULE`.
- **AC-10**: Erreurs d'API : sans jeton, 401 `UNAUTHENTICATED` ; payload invalide, 400 `VALIDATION_ERROR` ; contrat d'un autre agent appelé par un `AGENT`, 404 `NOT_FOUND`. Chaque réponse d'erreur a la forme `{ code, message, requestId }`.
- **AC-11**: Si Docker n'est pas disponible, `npm run test:int` échoue tout de suite avec un message clair en français, sans sauter les tests en silence.
- **AC-12**: La CI lance `npm run test:int` comme étape du job existant, après `npm test`, et le job échoue si un test d'intégration échoue.

## Decision

**Chosen option**: Option 1: Testcontainers, TRUNCATE avant chaque test, suite séparée

Les tests d'intégration tournent via `npm run test:int` sur un Postgres 16 jetable démarré par Testcontainers, isolés par un `TRUNCATE` avant chaque test, avec des tests HTTP sur l'app configurée comme en prod et des fabriques de données en TypeScript.

**Implementation skills**: `javascript-typescript-jest` (`github/awesome-copilot`, `.agents/skills/javascript-typescript-jest/`) · `nestjs-best-practices` (`kadajett/agent-nestjs-skills`, `.agents/skills/nestjs-best-practices/`) · `prisma-client-api` (`prisma/skills`, `.agents/skills/prisma-client-api/`, écrit pour Prisma 7, le projet est en Prisma 6)

## Feature design

**Data model sketch**:
Aucun changement de schéma. Les tests écrivent dans les tables existantes via des fabriques :

| Fabrique | Table | Valeurs par défaut (surchargeables) |
|---|---|---|
| `creerAgent(prisma, opts?)` | `agents` | `id` UUID, `nom`, `telephone` unique d'au moins 8 chiffres (préfixe fixe + compteur du module, pour respecter `loginSchema`), `passwordHash` = `hash()` de `@node-rs/argon2` sur le mot de passe de test (même appel que `AuthService`), `role` `AGENT`, `actif` vrai, `mustChangePassword` faux, `numeroAgent` nul ; renvoie l'agent et son mot de passe en clair |
| `creerMembre(prisma, ownerId, opts?)` | `membres` | `id` UUID, `nom`, `prenoms`, `profession`, `quartier`, `dateSouscription` aujourd'hui (colonne `@db.Date`) ; `codeMembre` et `numeroMembre` nuls |
| `creerContrat(prisma, membre, opts?)` | `contrats` | `id` UUID, `ownerId` du membre, `groupe` `GROUPE_1` ; cadence, `intervalleJours`, `moisParCycle`, `misesParMois`, `targetMises`, commissions, `creditAutorise`, `maxAvances` tirés de `parametresGroupe('GROUPE_1')` ; `startDate` aujourd'hui, `endDate` = `dateEcheance(startDate, params)` ; `miseAmount` 500n ; `statut` `ACTIF`. Toute valeur est surchargeable, dont `targetMises` (aucune contrainte en base ne la lie aux paramètres) et `statut` |

**State transitions**:
Contrat pendant l'encaissement : `ACTIF` → `TERMINE` quand le cumul des mises atteint `targetMises`. Un contrat non `ACTIF` refuse tout encaissement.

**API surface**:
Surface de test (pas de nouvelle route) :

| Élément | Type | Entrées | Sorties | Erreurs clés |
|---|---|---|---|---|
| `npm run test:int` | script | aucune | code de sortie Jest | Docker absent : échec avec message clair |
| `test/support/global-setup.ts` | Jest `globalSetup` | aucune | conteneur démarré, migrations appliquées, `DATABASE_URL` et secrets JWT de test posés | Docker absent, migration en échec |
| `test/support/global-teardown.ts` | Jest `globalTeardown` | aucune | conteneur arrêté | aucune |
| `creerAppDeTest(opts?)` | helper | `{ limiteDeDebit?: boolean }` (faux par défaut) | `INestApplication` configurée par `configurerApp`, `PrismaService` | aucune |
| `viderBase(prisma)` | helper | aucune | tables vidées | refuse si l'URL n'est pas celle du conteneur |
| `seConnecter(app, telephone, motDePasse)` | helper | identifiants | jeton d'accès | échec si le login ne renvoie pas 200 |
| `src/app.setup.ts` `configurerApp(app)` | fonction prod | `INestApplication` | app configurée | aucune |

Route exercée : `POST /api/v1/versements`, entrées `id` UUID (opt), `contratId` UUID (req), `misesCount` entier positif (req), `paidAt` date (opt) ; sortie : le versement ; auth bearer ; erreurs 400, 401, 404, 422.

**Détails du harnais** (fixés ici pour que le build n'ait rien à inventer):
- **Partage d'état** : le global setup pose `process.env.DATABASE_URL` et `process.env.TEST_DATABASE_URL` (la même URL, la seconde sert de référence au garde fou), garde le conteneur dans `globalThis.__PG_CONTAINER__`, et le global teardown appelle `stop()` dessus. Avec `--runInBand`, les tests tournent dans le même processus et voient ces variables. Pas de `withReuse`, et Ryuk reste actif (ne jamais poser `TESTCONTAINERS_RYUK_DISABLED`) pour qu'un lancement interrompu ne laisse pas de conteneur.
- **Démarrage du conteneur** : `new PostgreSqlContainer('postgres:16-alpine').withStartupTimeout(180_000).start()` dans un `try` ; en cas d'échec, lever `Error('Docker est introuvable ou arrêté. Lance Docker Desktop puis relance npm run test:int.')`, ce qui fait échouer toute la commande. Le premier téléchargement de l'image peut dépasser une minute sous Windows, d'où ce délai large (le `testTimeout` ne s'applique pas au global setup).
- **Migrations** : `execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: uri }, stdio: 'inherit', shell: true })`. Un script `pretest:int` lance `prisma generate` avant, pour éviter un client Prisma périmé.
- **Variables d'env des tests** : `test/support/setup-env.ts`, déclaré en `setupFiles`, pose `NODE_ENV=test`, `JWT_ACCESS_SECRET` et `JWT_REFRESH_SECRET` (constantes de test d'au moins 16 caractères), `JWT_ACCESS_TTL=900`, `JWT_REFRESH_TTL=2592000` et `MEDIA_DIR` (un dossier sous `os.tmpdir()`). `ConfigModule` lit aussi le `.env` local, mais `process.env` passe avant lui : ces valeurs l'emportent toujours sur celles de dev.
- **Config Jest** (`test/jest-int.json`, aucun héritage de la clé `jest` du `package.json`) : `rootDir: ".."`, `testEnvironment: "node"`, `moduleFileExtensions: ["js","json","ts"]`, `testRegex: "test/integration/.*\\.int-spec\\.ts$"`, `transform: {"^.+\\.ts$": "ts-jest"}`, `moduleNameMapper: {"^@/(.*)$": "<rootDir>/src/$1"}`, `globalSetup`, `globalTeardown`, `setupFiles`, `testTimeout: 30000`.
- **App de test** : `Test.createTestingModule({ imports: [AppModule] })`, plus `.overrideProvider(ThrottlerGuard).useValue({ canActivate: () => true })` sauf si `limiteDeDebit` est vrai, puis `compile()`, `createNestApplication({ logger: false })`, `configurerApp(app)` et `app.init()`. Les requêtes passent par `request(app.getHttpServer())`. Chaque fichier crée l'app une fois (`beforeAll`), appelle `viderBase` dans un `beforeEach`, et ferme l'app dans `afterAll` (sinon la connexion Prisma reste ouverte et Jest ne s'arrête pas).
- **`configurerApp(app)`** : helmet, middleware `requestId`, `AllExceptionsFilter`, préfixe `api/v1`, CORS avec `CORS_ORIGIN` lu via `app.get(ConfigService)`, et le correctif `BigInt.prototype.toJSON` appliqué dans la fonction (une seule fois). `enableShutdownHooks` et `listen` restent dans `main.ts`.
- **`viderBase(prisma)`** : refuse si `process.env.DATABASE_URL` diffère de `TEST_DATABASE_URL`, ou si `SELECT current_database()` ne renvoie pas le nom de base du conteneur. Ensuite, lit `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'` et lance un seul `TRUNCATE TABLE "a", "b", ... RESTART IDENTITY CASCADE` via `$executeRawUnsafe`, avec les noms entre guillemets doubles.
- **`seConnecter`** : `POST /api/v1/auth/login` doit renvoyer 200 ; le helper renvoie `accessToken`. `mustChangePassword` ne bloque aucune route, donc la valeur par défaut faux suffit.
- **Test de la limite (AC-6)** : `creerAppDeTest({ limiteDeDebit: true })`, un agent, puis 11 logins valides à la suite : les appels 1 à 10 renvoient 200, le 11e renvoie 429 `RATE_LIMITED`. La mémoire de la limite vit dans chaque instance d'app, et le test tient largement dans la fenêtre de 60 secondes.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| global setup | URL de la base de test | `getConnectionUri()` du conteneur Testcontainers, posée dans `process.env.DATABASE_URL` |
| setup des tests | secrets JWT, TTL et `MEDIA_DIR` exigés par `validateEnv` | constantes de test posées par `test/support/setup-env.ts` (voir Détails du harnais) |
| AC-7 | `miseAmount` du contrat | 500n par défaut dans `creerContrat` (aucune source dans le domaine, c'est un choix de test) |
| AC-9 | objectif atteignable en un test | `targetMises` surchargé à 5 dans le test |
| AC-9 | contrat non actif | `statut` surchargé à `SUSPENDU` |
| AC-8 | même versement | `id` et `receiptNumber` identiques entre les deux réponses, et `prisma.versement.count()` égal à 1 |
| global setup | image Postgres | constante `postgres:16-alpine`, alignée sur `docker-compose.yml` |
| login de test | mot de passe en clair | constante de test renvoyée par `creerAgent` |
| AC-7 | montant attendu | dérivé de `misesCount` envoyé × `miseAmount` du contrat créé par la fabrique |
| AC-7 | plage de mises attendue | dérivée du cumul de mises déjà versées dans le test (0 au départ) |
| AC-7 | format du reçu | regex `^REC-\d{8}-\d{5}$` (numéro réel tiré de `receipt_seq`, non remis à zéro ; la date suit l'heure locale du serveur, donc ne pas la comparer à une date UTC) |
| AC-9 | statut final du contrat | colonne `contrats.statut` relue en base après la requête |
| AC-10 | `requestId` | posé par le middleware `requestId` et renvoyé par le filtre global |
| AC-6 | seuil de la limite | 10 appels par minute, tiré du `@Throttle` de `auth.controller.ts` |

**Key invariants**:
- Les tests ne se connectent jamais à une autre base que le conteneur : `viderBase` vérifie que `DATABASE_URL` est l'URL posée par le global setup avant tout `TRUNCATE`.
- Chaque test commence sur des tables vides ; aucun test ne compte sur un ordre d'exécution.
- L'app de test et l'app de prod sont configurées par la même fonction `configurerApp`.
- La neutralisation de la limite de débit n'existe que dans `creerAppDeTest` ; le code de prod garde la limite active.

**Security model**:
Aucune donnée réelle : seules des données inventées par les fabriques entrent dans une base jetable, détruite à la fin. Les secrets JWT de test ne sont valables que dans le processus de test et ne sont pas ceux de `.env`. Les tests vérifient la portée par rôle existante (un `AGENT` reçoit 404 sur le contrat d'un autre agent).

**Configuration required**:
- Aucune nouvelle variable d'environnement pour l'app. Le global setup pose lui même `DATABASE_URL`, `JWT_ACCESS_SECRET` et `JWT_REFRESH_SECRET` pour le processus de test.
- Nouvelles dépendances de dev : `@testcontainers/postgresql`, `supertest`, `@types/supertest`.
- Prérequis machine : Docker démarré (Docker Desktop sous Windows ; déjà présent sur `ubuntu-latest` en CI).

**Critical test scenarios**:
- Happy path : un agent se connecte, encaisse 3 mises sur son contrat actif et reçoit 201 avec montant, plage de mises et reçu valides, verifies **AC-5**, **AC-7**
- Failure case : le même `id` envoyé deux fois ne crée qu'un versement ; un versement qui dépasse l'objectif renvoie 422 sans écrire, verifies **AC-8**, **AC-9**
- Auth/permission : sans jeton, 401 ; un `AGENT` qui vise le contrat d'un autre agent reçoit 404 `NOT_FOUND`, verifies **AC-10**

## Build plan

Ordre Tracer Bullet : d'abord un seul test qui traverse tout le harnais (conteneur, migrations, app, login, encaissement), puis on épaissit ce fil cas par cas.

1. [x] Extraire la configuration de `main.ts` dans `src/app.setup.ts` (`configurerApp(app)` : helmet, middleware `requestId`, filtre global, préfixe `api/v1`, CORS, sérialisation des `BigInt`), et l'appeler depuis `main.ts` sans changer le comportement, satisfies **AC-4**
2. [x] Dans `AppModule`, déclarer `ThrottlerGuard` comme provider et `{ provide: APP_GUARD, useExisting: ThrottlerGuard }` à la même place qu'aujourd'hui, pour garder l'ordre des guards globaux (limite, puis JWT, puis rôles) ; le test AC-6 (tâche 8) sert de filet pour ce changement, satisfies **AC-5**, **AC-6**
3. [x] Ajouter les dépendances de dev (`@testcontainers/postgresql`, `supertest`, `@types/supertest`), le fichier `test/jest-int.json` complet (voir Détails du harnais), le script `test:int` (`jest --config test/jest-int.json --runInBand`) et `pretest:int` (`prisma generate`), satisfies **AC-1**, **AC-2**
4. [x] Écrire `test/support/global-setup.ts` (conteneur avec délai de 180 secondes et message clair si Docker manque, `prisma migrate deploy`, `DATABASE_URL` et `TEST_DATABASE_URL`, conteneur dans `globalThis`), `test/support/global-teardown.ts` et `test/support/setup-env.ts`, satisfies **AC-1**, **AC-11**
5. [x] Écrire `test/support/` : `creerAppDeTest`, `viderBase` (avec ses deux vérifications), `seConnecter`, et les fabriques `creerAgent`, `creerMembre`, `creerContrat`, satisfies **AC-3**, **AC-5**
6. [x] Premier fil complet : `test/integration/collecte.int-spec.ts` avec le cas nominal (login puis encaissement, vérifications en réponse et en base), satisfies **AC-7**
7. [x] Épaissir le fil : idempotence, objectif atteint, dépassement, contrat non actif, satisfies **AC-8**, **AC-9**
8. [x] Ajouter les cas d'erreur d'API (401, 400, 404 entre agents, forme `{ code, message, requestId }`) et `test/integration/limite-debit.int-spec.ts` pour le 429 sur le 11e login, satisfies **AC-6**, **AC-10**
9. [x] Ajouter l'étape `npm run test:int` après `npm test` dans `.github/workflows/ci.yml`, poser `timeout-minutes: 15` sur le job, et retirer le commentaire devenu obsolète sur le service Postgres, satisfies **AC-12**
10. [ ] Ajouter `npm run test:int` aux commandes de `AGENTS.md` (via `/sync`), satisfies **AC-1**

## Consequences

**Positive**:
- Chaque fonction suivante du pilote (retrait, rapport de caisse, journal d'audit, clôture) peut être prouvée contre une vraie base en quelques lignes, avec les mêmes fabriques.
- La CI attrape désormais les erreurs de requête, de contrainte, de séquence et de câblage des guards.
- L'app de test et l'app de prod ne peuvent plus diverger, grâce à `configurerApp`.

**Negative / tradeoffs**:
- Docker devient nécessaire pour lancer `npm run test:int` en local ; sous Windows, Docker Desktop doit tourner.
- Le job CI s'allonge du démarrage du conteneur et de la suite en série.
- Deux petits changements touchent le code de prod (`app.setup.ts`, `useExisting` du guard) : à relire avec soin, même s'ils ne changent pas le comportement.
- Le retrait et la concurrence restent non couverts tant que la suite n'est pas épaissie, alors que c'est le risque le plus fort sur la caisse.

**Neutral**:
- Nouveau dossier `test/` à la racine, déjà visé par les scripts de lint et de format.
- Les numéros de reçu grossissent d'un test à l'autre, puisque les séquences ne sont pas remises à zéro.

## Follow-up

- [ ] Épaissir la suite avec le retrait (total, partiel, commission prioritaire, contrat non actif), sur ce même harnais.
- [ ] Ajouter un test de concurrence : deux retraits (et deux encaissements) simultanés sur le même contrat. Le retrait lit ses agrégats sans verrouiller la ligne du contrat ; ce test dira s'il faut un verrou (`SELECT ... FOR UPDATE`).
- [ ] Ajouter les tests de portée par rôle (AGENT, SUPERVISEUR, ADMIN) sur les autres modules.
- [x] Mettre à jour la ligne Done when de la fonction 1 du scope : cette livraison couvre l'encaissement seul, le retrait est reporté (fonction 9 du scope).
- [ ] Agent Skills et MCP pour Testcontainers et supertest : refusés pour cette fonction, ne pas les reproposer.
## Rationale

Contexte, options et raisonnement : voir [rationale.md](rationale.md).
