# 0004. Mise en ligne sur Render et Supabase

## Summary

On adapte l'API pour qu'elle tourne sur Render gratuit avec Supabase : faire confiance au proxy de Render pour la limite de débit, se connecter à Postgres par le pooler, ranger les photos dans Supabase Storage, fermer l'accès direct de Supabase aux tables, vérifier la base dans la santé, créer le premier compte admin, dater les reçus à l'heure du Bénin, et déployer automatiquement après la CI. Le dev et les tests restent comme aujourd'hui.

## Requirements

**User stories**:
- En tant que responsable du pilote, je veux l'API en ligne en HTTPS sur mon domaine, sans payer, pour que les agents s'y connectent.
- En tant qu'agent, je veux que la limite de connexions s'applique à mon téléphone, pas à tous les agents réunis.
- En tant que responsable, je veux qu'aucune donnée de membre ou d'argent ne soit lisible autrement que par l'API.
- En tant que développeur, je veux qu'un merge sur `main` avec la CI verte mette la prod à jour tout seul.

**Acceptance criteria**:
- **AC-1**: `TRUST_PROXY` (entier ≥ 0, défaut `0`) règle `trust proxy` d'Express dans `configurerApp`. Avec `TRUST_PROXY=1`, deux clients qui arrivent par le même proxy avec des `X-Forwarded-For` différents ont chacun leur limite de débit, et une valeur ajoutée à gauche par le client ne change pas l'IP retenue. Avec `0`, le comportement est celui d'aujourd'hui.
- **AC-2**: `schema.prisma` déclare `directUrl = env("DIRECT_URL")`. `DIRECT_URL` est obligatoire quand `NODE_ENV=production` et facultative sinon ; en dev, en tests et dans `.env.example`, elle vaut la même chose que `DATABASE_URL` (Prisma échoue si la variable déclarée manque). En prod, `DATABASE_URL` vise le pooler en mode transaction (port 6543, `?pgbouncer=true&connection_limit=5`) et `DIRECT_URL` le pooler en mode session (port 5432) ; `prisma migrate deploy`, lancé au démarrage du conteneur, passe par `DIRECT_URL`.
- **AC-3**: `MEDIA_DRIVER` (`disque` par défaut, ou `s3`) choisit où `MediaService` écrit et lit les photos. Avec `s3`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` et `S3_SECRET_ACCESS_KEY` sont obligatoires (l'API refuse de démarrer sinon). Les deux pilotes ont le même comportement visible : mêmes types et tailles acceptés, idempotence par `id`, déduplication par `checksum`, clé de l'objet = `media.chemin` (`<id>.<ext>`, sans préfixe), même portée par rôle ; un objet absent donne le même 404 qu'aujourd'hui (« Fichier média absent du stockage »).
- **AC-4**: Les photos se lisent toujours par `GET /api/v1/media/:id` ; le bucket `photos` est privé (aucune URL publique), l'API lit l'objet avec ses clés. La base de prod part vide : aucune photo à migrer.
- **AC-5**: Le Data API de Supabase (accès direct aux tables par la clé publique) est désactivé dans le projet, et une migration retire tous les droits des rôles `anon` et `authenticated` sur le schéma `public` (tables, séquences, fonctions, et droits par défaut), si ces rôles existent ; la migration ne fait rien sur une base Postgres sans ces rôles (dev, tests).
- **AC-6**: `GET /api/v1/health` reste public et ajoute `database: "ok"` après un `SELECT 1` réussi ; si la base ne répond pas, la route renvoie 503 avec `database: "injoignable"`, pour qu'UptimeRobot voie aussi une base en pause ou injoignable.
- **AC-7**: Un script `npm run admin:creer -- --telephone <t> --nom <n>` crée le premier compte `ADMIN` en prod : mot de passe temporaire tiré par `genererMotDePasse` et haché comme dans `AgentsService.creer`, `numeroAgent` tiré de la séquence `agent_seq`, `mustChangePassword` vrai ; le mot de passe est affiché une seule fois. Il refuse un téléphone déjà pris. Il tourne en local (`ts-node` avec `tsconfig-paths`) contre `DIRECT_URL`. Le seed de démo n'est jamais lancé en prod.
- **AC-8**: Le numéro de reçu (`REC-AAAAMMJJ-NNNNN`) prend la date du jour du Bénin (`jourBenin`), plus celle du serveur : un reçu émis à 00:30 au Bénin porte la date de ce jour, même sur un serveur en UTC.
- **AC-9**: `CORS_ORIGIN` est obligatoire quand `NODE_ENV=production` (plus de défaut `localhost`) et vaut l'URL du back office web, à renseigner dans Render quand elle existe.
- **AC-10**: Un fichier `render.yaml` (Blueprint) décrit le web service : `type: web`, `runtime: docker`, `dockerfilePath: ./Dockerfile`, `plan: free`, `region: frankfurt`, `healthCheckPath: /api/v1/health`, `autoDeployTrigger: checksPass`, et toutes les variables de prod. Valeurs fixes : `NODE_ENV=production`, `SWAGGER_ENABLED=false`, `TRUST_PROXY=1`, `MEDIA_DRIVER=s3`, `MEDIA_MAX_BYTES=2097152`, `JWT_ACCESS_TTL=900`, `JWT_REFRESH_TTL=2592000`. Secrets en `sync: false` : `DATABASE_URL`, `DIRECT_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `SENTRY_DSN`. `PORT` n'y figure pas : Render le fournit et l'API le lit déjà.
- **AC-11**: Un guide `docs/exploitation/mise-en-ligne.md` décrit pas à pas la première mise en ligne : projet Supabase en `eu-central-1`, Data API désactivé, bucket privé `photos` et clés S3, URLs du pooler ; Blueprint Render et secrets ; domaine personnalisé (entrée DNS `CNAME` vers Render) ; premier admin ; vérification `GET https://<domaine>/api/v1/health` en 200 avec `database: "ok"` ; contrôle du nombre de sauts du proxy (AC-1). Il rappelle que les migrations doivent rester additives (l'ancienne version sert encore pendant un déploiement) et que tout second service gratuit dans l'espace Render entame les 750 heures du mois.
- **AC-12**: Les tests d'intégration et `npm test` passent sans aucune variable de prod : `test/support/setup-env.ts` fixe `MEDIA_DRIVER=disque`, `TRUST_PROXY=0`, `DIRECT_URL` égale à l'URL de test, et retire `SENTRY_DSN`, pour qu'un `.env` local ne fuie pas dans les tests.

## Design

**`trust proxy`** (dans `configurerApp`) : `app.getHttpAdapter().getInstance().set('trust proxy', config.get('TRUST_PROXY'))`. `ThrottlerGuard` s'appuie sur `req.ip`. On choisit un nombre de sauts et non `true` : le proxy de Render ajoute l'IP du client à `X-Forwarded-For` sans filtrer ce que le client a envoyé. **Au premier déploiement**, une ligne de log temporaire (`req.ips`) confirme le nombre de sauts ; s'il n'est pas `1` (Render derrière un autre proxy), on passe par un `getTracker` personnalisé du throttler qui lit l'en tête `True-Client-IP` de Render.

**Pilote de stockage** (`src/modules/media/stockage/`) :
- interface `StockagePhotos { ecrire(cle, contenu, mime): Promise<void>; lire(cle): Promise<Buffer | null>; existe(cle): Promise<boolean> }`, `lire` renvoyant `null` pour un objet absent (le service lève alors son 404 actuel) ;
- `StockageDisque` : le code actuel de `MediaService` (dossier `MEDIA_DIR`) déplacé tel quel ;
- `StockageS3` : `@aws-sdk/client-s3`, `forcePathStyle: true`, endpoint `https://<ref>.supabase.co/storage/v1/s3` (celui affiché dans le tableau de bord Storage du projet fait foi), `PutObject`, `GetObject` (`NoSuchKey` donne `null`), `HeadObject` pour `existe` ;
- un fournisseur Nest choisit l'implémentation selon `MEDIA_DRIVER` ; `MediaService` ne connaît que l'interface.
- **Repli** si l'API S3 n'est pas disponible sur le plan gratuit (vérifié en première tâche) : `StockageSupabase`, mêmes méthodes par l'API REST du Storage (`/storage/v1/object/photos/<cle>`, en tête `Authorization: Bearer <clé service_role>`), choisi par `MEDIA_DRIVER=supabase` avec `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`. On ne le construit que dans ce cas.

**Prisma et pooler** : `datasource db { provider = "postgresql" url = env("DATABASE_URL") directUrl = env("DIRECT_URL") }`. `connection_limit=5` : une seule instance, bien en dessous du pool gratuit. Le code est compatible avec le mode transaction (vérifié en relecture) : transactions interactives avec `FOR UPDATE`, transactions en tableau `RepeatableRead`, `$queryRaw` sur `nextval` et `sync_seq`, sans état de session ni `LISTEN`. Le verrou consultatif de `prisma migrate` passe par `DIRECT_URL` (mode session).

**Migration de fermeture du Data API** (SQL dans la migration, protégé par un test d'existence des rôles) : pour `anon` et `authenticated`, `REVOKE ALL ON ALL TABLES, ALL SEQUENCES, ALL FUNCTIONS IN SCHEMA public` et `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES, SEQUENCES, FUNCTIONS`. On n'active pas RLS (la sécurité est dans l'API, et le rôle de sauvegarde reste simple).

**Santé** : `HealthController` reçoit `PrismaService` et fait `SELECT 1` avec un délai court ; 200 `{ status: "ok", database: "ok", … }` ou 503 `{ status: "degrade", database: "injoignable", … }`.

**Reçu** : `prochainRecu` remplace `new Date()` par `jourBenin(maintenant)` (même date `AAAAMMJJ`, sans tirets). `maintenant` vient du service appelant (`ClockService`), comme la date terrain.

**Env** (`env.validation.ts`) :

| Variable | Type | Défaut | Rôle |
|---|---|---|---|
| `DIRECT_URL` | URL | obligatoire en prod | Migrations (et sauvegardes) par le pooler en mode session |
| `TRUST_PROXY` | entier ≥ 0 | `0` | Nombre de proxys de confiance (Render : `1`) |
| `MEDIA_DRIVER` | `disque` \| `s3` | `disque` | Où vivent les photos |
| `S3_*` (5 variables) | chaînes | absentes | Obligatoires si `MEDIA_DRIVER=s3` |
| `CORS_ORIGIN` | chaîne | `http://localhost:3000` hors prod, obligatoire en prod | Origine du back office web |

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| limite de débit | IP du client | `req.ip`, réglé par `TRUST_PROXY` |
| photo | emplacement | `MEDIA_DRIVER` puis `MEDIA_DIR` ou `S3_*` |
| photo | clé | `media.chemin` (`<id>.<ext>`) |
| migrations | URL | `DIRECT_URL` |
| santé | état de la base | `SELECT 1` par `PrismaService` |
| premier admin | téléphone, nom | arguments ; mot de passe `genererMotDePasse` ; numéro `agent_seq` |
| reçu | date | `jourBenin(ClockService.now())` |
| CORS | origine | `CORS_ORIGIN` |
| déploiement | déclencheur | `autoDeployTrigger: checksPass` sur `main` |

**Critical test scenarios**:
- Limite par client : avec `TRUST_PROXY=1`, 11 logins sous `X-Forwarded-For: 1.1.1.1` donnent un 429 au 11e, pendant qu'un login sous `2.2.2.2` passe ; `X-Forwarded-For: 9.9.9.9, 1.1.1.1` compte pour `1.1.1.1`, verifies **AC-1**
- Pilote S3 : tests unitaires de `StockageS3` contre un client S3 simulé (écriture, lecture, `NoSuchKey` en `null`, `HeadObject`) ; tests d'intégration des médias au vert avec le pilote disque, verifies **AC-3**, **AC-12**
- Env : `MEDIA_DRIVER=s3` sans `S3_BUCKET`, ou `NODE_ENV=production` sans `DIRECT_URL` ou sans `CORS_ORIGIN`, font échouer `validateEnv`, verifies **AC-2**, **AC-3**, **AC-9**
- Data API : sur une base avec rôles `anon` et `authenticated`, la migration leur retire tout droit ; sur la base de test, elle passe sans erreur, verifies **AC-5**
- Santé : 200 avec `database: "ok"` ; 503 quand `SELECT 1` échoue (Prisma simulé), verifies **AC-6**
- Reçu : avec l'horloge figée à `2026-10-28T23:30:00Z`, le reçu porte `20261029`, verifies **AC-8**
- Script admin : crée un ADMIN avec `mustChangePassword` et un `numeroAgent`, refuse un téléphone existant, verifies **AC-7**

## Build plan

1. Vérifier sur le compte Supabase que l'API S3 du Storage est disponible sur le plan gratuit (sinon basculer sur le repli `StockageSupabase`) et noter la version majeure de Postgres, satisfies **AC-3**
2. Isolation des tests (`setup-env.ts`) et nouvelles variables d'env, `DIRECT_URL` dans `schema.prisma`, `.env.example` et le harnais, satisfies **AC-2**, **AC-9**, **AC-12**
3. `TRUST_PROXY` dans `configurerApp` avec le test de limite par client, satisfies **AC-1**
4. Pilote de stockage (interface, disque, S3) et tests, satisfies **AC-3**, **AC-4**
5. Migration de fermeture du Data API, santé avec `SELECT 1`, date Bénin des reçus, et leurs tests, satisfies **AC-5**, **AC-6**, **AC-8**
6. Script `admin:creer` et ses tests, satisfies **AC-7**
7. `render.yaml` et le guide `docs/exploitation/mise-en-ligne.md`, satisfies **AC-10**, **AC-11**
8. Première mise en ligne en suivant le guide : santé en 200 sur le domaine, nombre de sauts du proxy confirmé, satisfies **AC-1**, **AC-10**, **AC-11**

## Rationale (short)

Sur Render, chaque requête passe par un proxy : sans `trust proxy`, la limite de 10 connexions par minute serait partagée par tous les agents. Le pooler est imposé par l'IPv4 ; deux URLs séparent l'usage courant (transaction) de ce qui a besoin d'une session (migrations, `pg_dump`). Le Data API de Supabase exposerait sinon les tables à la clé publique du projet. La santé qui touche la base évite de croire l'API en forme quand Supabase est en pause. Le reçu daté à l'heure du serveur deviendrait faux en UTC.
