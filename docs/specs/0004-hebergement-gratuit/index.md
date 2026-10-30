# 0004. Hébergement gratuit du pilote

**Date**: 2026-10-29
**Status**: In Progress

## Summary

On met l'API en ligne pour le pilote sans payer et sans carte bancaire : l'API sur Render (plan gratuit, Docker, région Francfort), la base et les photos sur Supabase (plan gratuit), les sauvegardes chiffrées par GitHub Actions dans un dépôt privé (avec une copie mensuelle sur Google Drive), et les alertes par UptimeRobot, Healthchecks.io et Sentry. Aucun de ces services ne garantit sa disponibilité, donc les sauvegardes hors service et leur restauration testée sont la vraie assurance. Ce spec chapeaute trois specs à construire : la mise en ligne, les sauvegardes (fonction 7) et les alertes (fonction 8).

## Structure

- [0004-mise-en-ligne.md](0004-mise-en-ligne.md) : Render, Supabase, `trust proxy`, connexion Prisma par le pooler, stockage des photos, fermeture du Data API de Supabase, santé avec la base, premier compte admin, date Bénin des reçus, déploiement après CI verte. Nouvelle fonction du scope.
- [0004-sauvegardes.md](0004-sauvegardes.md) : sauvegardes chiffrées quotidiennes, hebdomadaires et mensuelles, contrôle de restauration automatique, exercice manuel documenté. Fonction 7 du scope.
- [0004-alertes.md](0004-alertes.md) : panne de `/api/v1/health` (UptimeRobot), erreurs 500 avec `requestId` (Sentry), sauvegarde manquée (Healthchecks.io). Fonction 8 du scope.

## Decision

**Chosen option**: Option 2 : services gérés gratuits sans carte (voir [rationale.md](rationale.md))

L'API tourne sur Render gratuit, gardée éveillée par le contrôle d'UptimeRobot toutes les 5 minutes ; Postgres et les photos vivent sur Supabase gratuit ; tout ce qui pourrait disparaître avec un fournisseur est copié chaque nuit, chiffré, hors de ces services.

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `sentry-nestjs-sdk` (`getsentry/sentry-for-ai`, `.agents/skills/sentry-nestjs-sdk/`) · `github-actions-templates` (`wshobson/agents`, `.agents/skills/github-actions-templates/`) · `nestjs-best-practices` (`kadajett/agent-nestjs-skills`, `.agents/skills/nestjs-best-practices/`) · `prisma-client-api` (`prisma/skills`, `.agents/skills/prisma-client-api/`)

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Hébergement de l'API | Render, web service gratuit, image Docker du dépôt, région `frankfurt` | Sans carte, HTTPS et domaine personnalisé inclus, déploie depuis GitHub ; Francfort est la région la plus proche du Bénin. |
| Réveil | UptimeRobot, contrôle HTTPS de `/api/v1/health` toutes les 5 minutes | Render endort le service après 15 minutes sans trafic ; le même contrôle sert d'alerte de panne. 750 heures gratuites par mois couvrent un service allumé en continu. |
| Base de données | Supabase Postgres gratuit, région Francfort (`eu-central-1`) | 500 Mo suffisent au pilote ; pas d'expiration (contrairement au Postgres gratuit de Render, supprimé après 30 jours). |
| Connexion à la base | Pooler Supavisor : mode transaction (port 6543, `pgbouncer=true`) pour l'API, mode session (port 5432) pour les migrations et `pg_dump` | Le pooler est joignable en IPv4 (la connexion directe est IPv6 seulement), ce dont Render et GitHub Actions ont besoin. |
| Photos | Supabase Storage, bucket privé `photos`, par l'API compatible S3 ; disque local en dev et en tests | Le disque de Render est effacé à chaque déploiement ; l'API S3 garde le code portable (R2, B2) ; le bucket privé garde la portée par rôle dans l'API. |
| Sauvegardes | GitHub Actions dans un dépôt privé dédié `agbajowo-sauvegardes`, chiffrement `age`, artefacts et Releases, copie mensuelle sur Google Drive par `rclone` | Gratuit et sans carte ; les Releases n'ont pas de limite de volume total ; deux fournisseurs différents pour l'archive mensuelle. |
| Observabilité | Sentry (plan Developer gratuit) pour les erreurs 500, UptimeRobot pour la disponibilité, Healthchecks.io pour les sauvegardes, alertes par e-mail | Couvre le « Done when » de la fonction 8 : panne ou erreur serveur signalée en quelques minutes, avec le `requestId`. |
| Déploiement | Render « Auto-Deploy : After CI Checks Pass » sur `main`, décrit par un `render.yaml` (Blueprint) | Aucune version ne part sans la CI verte ; la configuration vit dans le dépôt, pas seulement dans le tableau de bord. |

## Cross child contract

Ces règles valent pour les trois specs enfants.

- **Variables d'environnement nouvelles**, toutes validées au démarrage par `src/config/env.validation.ts` : `DIRECT_URL`, `TRUST_PROXY`, `MEDIA_DRIVER`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `SENTRY_DSN` ; `DIRECT_URL` et `CORS_ORIGIN` deviennent obligatoires quand `NODE_ENV=production`. Leur contrat exact est dans [0004-mise-en-ligne.md](0004-mise-en-ligne.md) et [0004-alertes.md](0004-alertes.md). Les tests fixent eux mêmes les valeurs neutres (`setup-env.ts`), pour qu'un `.env` local ne fuie pas.
- **Accès aux données** : seule l'API lit et écrit la base. Le Data API de Supabase est coupé et les rôles `anon` et `authenticated` n'ont aucun droit sur `public` ; RLS reste désactivé (la sécurité est dans l'API).
- **Secrets** : jamais dans le dépôt. Ceux de l'API dans les variables d'environnement Render (`sync: false` dans le Blueprint) ; ceux des sauvegardes dans les secrets Actions du dépôt `agbajowo-sauvegardes`. La clé privée `age` est aussi gardée hors ligne par le responsable.
- **Région** : tout en Europe, Francfort. Les données personnelles des membres sont donc hébergées hors du Bénin (à reprendre dans la fonction 6, APDP).
- **Swagger** : `SWAGGER_ENABLED=false` en prod (spec de la doc Swagger, commit `6391bdb`).
- **Fuseau** : les tâches planifiées sont exprimées en UTC dans les workflows ; leur heure au Bénin est indiquée en commentaire (UTC+1).

## Consequences

**Positive**:
- Mise en ligne à zéro euro, sans carte bancaire, avec HTTPS et déploiement automatique.
- Les sauvegardes et la restauration testée rendent la perte d'un fournisseur gênante, pas fatale.
- Le code reste portable : Docker, Postgres standard, stockage S3 ; passer à un VPS ou à un plan payant ne demande pas de réécriture.

**Negative / tradeoffs**:
- Aucune garantie de service : si Render, Supabase ou GitHub change son offre gratuite, il faudra migrer, parfois vite.
- Si le contrôle d'UptimeRobot manque, la première requête après 15 minutes attend environ une minute le réveil de Render.
- Une seule instance, 512 Mo de RAM, 0,1 CPU : suffisant pour 10 agents, pas pour une montée en charge.
- Les 750 heures gratuites de Render sont par espace de travail : un second service gratuit (préproduction, aperçu) empêcherait l'API de rester allumée tout le mois.
- Chaque démarrage applique les migrations : elles doivent rester additives, car l'ancienne version sert encore pendant un déploiement.
- Limites gratuites à surveiller : 500 Mo de base, 1 Go de photos, 5 Go de trafic sortant Supabase par mois ; 500 Mo d'artefacts GitHub dans un dépôt privé.
- Plus de pièces à tenir que sur un VPS unique : cinq comptes (Render, Supabase, GitHub, UptimeRobot et Healthchecks.io, Sentry) et un Google Drive.
- Données personnelles hors du Bénin.

**Neutral**:
- `docker-compose.prod.yml`, `Caddyfile` et `scripts/backup.sh` restent dans le dépôt pour un futur passage sur VPS ; ils ne servent pas sur Render.

## Follow-up

- [ ] Créer les comptes et vérifier sur place les points non confirmés par la recherche : inscription Sentry Developer sans carte, image Docker sur le plan gratuit de Render, API S3 du Storage sur le plan gratuit de Supabase (sinon, solution de repli décrite dans [0004-mise-en-ligne.md](0004-mise-en-ligne.md)), version majeure de Postgres du projet Supabase (pour `pg_dump`).
- [ ] Connecter les serveurs MCP officiels Supabase (lecture seule), Sentry et Render dans la configuration de Claude Code, une fois les comptes créés.
- [ ] Ajouter au `## Agent skills` de `AGENTS.md` les compétences installées (`supabase`, `sentry-nestjs-sdk`, `github-actions-templates`) : c'est le rôle de `/sync`.
- [ ] Corriger `scripts/smoke.mjs` (attente périmée « retrait partiel : net 500 ») avant de s'en servir comme contrôle, en dev seulement : il crée des données.
- [ ] Fonction 6 (APDP) : déclarer l'hébergement des données en Europe.
- [ ] Revoir ce choix si le pilote s'élargit : un plan payant ou un VPS avant que les limites gratuites ne gênent.

## Rationale

Raisonnement, options et références : voir [rationale.md](rationale.md).
