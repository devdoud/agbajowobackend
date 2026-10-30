# Verify: mise en ligne gratuite · spec 0004 (0004-mise-en-ligne.md) · updated 2026-10-30
_Steps derived from the mise en ligne acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Les sauvegardes et les alertes auront leurs propres sections._

## Commands (local)
- [x] `npm test` → 161 tests unitaires au vert, dont `env.validation` (DIRECT_URL et CORS_ORIGIN en prod, S3 avec MEDIA_DRIVER=s3), `stockage` (disque et S3 simulé), `health.controller` (200 et 503), `receipt` (date Bénin) → AC-2, AC-3, AC-6, AC-8, AC-9
- [x] `npm run test:int` → 12 suites et 88 tests au vert, dont `trust-proxy`, `fermer-data-api`, `premier-admin`, et les suites existantes sans aucune variable de prod → AC-1, AC-5, AC-7, AC-12
- [x] `npm run lint:ci && npm run format:check && npm run build` → propres → AC-10
- [x] `npm run admin:creer` sans argument → affiche l'usage (le script se charge avec l'alias `@/`) → AC-7
- [x] `docker build .` → l'image se construit en entier (build, client S3, CLI Prisma, `directUrl`, migration du Data API) → AC-10
- [x] L'image lancée en `NODE_ENV=production` contre la base locale → migrations appliquées par `DIRECT_URL` au démarrage, Nest démarré, `/api/v1/health` en 200 avec `"database": "ok"`, `/api/v1/docs` en 404 → AC-2, AC-6, AC-10
- [ ] Sur le compte Supabase : l'API S3 du Storage est disponible sur le plan gratuit, et la version majeure de Postgres est notée (tâche 1 du build plan) → AC-3

## Sur la prod, après le premier déploiement (docs/exploitation/mise-en-ligne.md)
- [ ] Logs Render : migrations appliquées (dont `20261030090000_fermer_data_api_supabase`) puis démarrage de Nest → AC-2, AC-5, AC-10
- [ ] `GET https://api.<domaine>/api/v1/health` → 200 avec `"database": "ok"` → AC-6, AC-11
- [ ] 11 connexions en une minute depuis un ordinateur → la 11e en 429 ; aussitôt après, connexion depuis un téléphone en données mobiles → 200 (la limite vaut par client, le proxy compte pour un saut) → AC-1
- [ ] Envoi puis relecture d'une photo → l'objet apparaît dans le bucket privé `photos`, et la relecture passe par `GET /api/v1/media/:id` → AC-3, AC-4
- [ ] Avec la clé publique (anon) du projet Supabase, une requête du Data API sur une table (`/rest/v1/versements`) est refusée ou introuvable → AC-5
- [ ] `npm run admin:creer` contre `DIRECT_URL` de prod → un ADMIN créé, connexion avec le mot de passe temporaire, changement exigé → AC-7
- [ ] Un reçu émis entre 00:00 et 01:00 heure du Bénin porte la date du jour (et non celle de la veille) → AC-8
- [ ] Une requête du back office depuis `CORS_ORIGIN` passe, une autre origine est refusée → AC-9
- [ ] `https://api.<domaine>/api/v1/docs` ne sert pas la documentation → AC-10
- [ ] Un merge sur `main` avec la CI verte redéploie tout seul (« After CI Checks Pass ») → AC-10

## Value sourcing
- [x] IP retenue pour la limite : `req.ip` réglé par `TRUST_PROXY` ; `X-Forwarded-For: 9.9.9.9, 1.1.1.1` compte pour `1.1.1.1` → AC-1
- [x] Emplacement des photos : `MEDIA_DRIVER` puis `MEDIA_DIR` ou `S3_*` ; clé = `media.chemin` ; objet absent = 404 actuel → AC-3
- [x] Migrations : `DIRECT_URL`, égale à `DATABASE_URL` en dev et en tests → AC-2
- [x] Date du reçu : `jourBenin(ClockService.now())`, `2026-10-28T23:30Z` donne `20261029` → AC-8
- [x] Premier admin : téléphone et nom en arguments, mot de passe `genererMotDePasse`, numéro `agent_seq` → AC-7

## Acceptance-criteria coverage
- AC-1 : `trust-proxy`, vérification prod · AC-2 : env, migrations · AC-3 : stockage, tâche 1, photo en prod · AC-4 : photo en prod · AC-5 : `fermer-data-api`, Data API en prod · AC-6 : santé (unitaire et prod) · AC-7 : `premier-admin`, script en prod · AC-8 : `receipt`, reçu de minuit · AC-9 : env, CORS en prod · AC-10 : build, `render.yaml`, Swagger éteint, auto-deploy · AC-11 : guide · AC-12 : suites sans variables de prod
