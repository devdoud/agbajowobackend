# 0004. Hébergement gratuit du pilote : raisonnement

## Context

Le pilote (au plus 10 agents, quelques centaines de membres, moins d'un mois) a besoin de l'API en ligne en HTTPS, joignable toute la journée pour les synchros, avec une base qui ne doit jamais disparaître (elle porte l'argent des membres) et un endroit durable pour les photos. Le dépôt contient déjà une pile de production pour un serveur unique : `Dockerfile` (migrations au démarrage), `docker-compose.prod.yml` (Postgres, API, Caddy en HTTPS) et `scripts/backup.sh` (sauvegarde locale).

Deux contraintes du responsable cadrent tout : **aucun budget** et **aucune carte bancaire physique**. Beaucoup d'offres « gratuites » demandent une carte pour vérifier l'identité, ce qui les écarte d'emblée.

Le code impose ses propres exigences. Derrière un proxy, l'API ne fait pas confiance à `X-Forwarded-For`, donc la limite de débit de `ThrottlerGuard` serait partagée par tous les clients. Les photos sont écrites sur le disque local (`MEDIA_DIR`). Les fonctions 7 (sauvegardes testées hors du serveur) et 8 (alerte en quelques minutes, avec le `requestId`) sont attendues avant le pilote.

## Options considered

### Option 1: VM Oracle Cloud Always Free

Une VM ARM gratuite (jusqu'à 4 cœurs, 24 Go de RAM, environ 200 Go de disque) qui fait tourner tel quel `docker-compose.prod.yml` avec Caddy ; sauvegardes vers un stockage objet gratuit ; alertes par UptimeRobot.

**Pros**:
- Toujours allumée, vrai disque, presque aucun changement de code.
- Une seule machine à comprendre.

**Cons**:
- Demande une carte bancaire pour s'inscrire : impossible pour le responsable.
- Capacité ARM parfois indisponible, VM inactive récupérable, système à administrer soi même.

### Option 2: services gérés gratuits sans carte (choisie)

Render gratuit pour l'API (Docker), Supabase gratuit pour Postgres et les photos, GitHub Actions pour les sauvegardes, UptimeRobot, Healthchecks.io et Sentry pour les alertes.

**Pros**:
- Aucune carte, aucun serveur à administrer, HTTPS et déploiement depuis GitHub inclus.
- Postgres sans date d'expiration, stockage objet pour les photos.

**Cons**:
- Render endort le service après 15 minutes : il faut un contrôle régulier pour le garder éveillé.
- Changements de code : `trust proxy`, pooler Prisma, pilote de stockage S3.
- Pas de sauvegarde automatique sur Supabase gratuit, et beaucoup de comptes à tenir.

### Option 3: tout sur Render gratuit

Le web service et le Postgres gratuit de Render, photos sur le disque.

**Pros**:
- Un seul fournisseur, mise en place la plus courte.

**Cons**:
- Le Postgres gratuit de Render expire 30 jours après sa création, sans sauvegarde : inacceptable pour des données d'argent.
- Pas de disque persistant sur le plan gratuit : les photos disparaîtraient à chaque déploiement.

## Rationale

L'Option 1 aurait été la plus simple techniquement, mais elle bute sur la carte bancaire, une contrainte dure. L'Option 3 échoue sur l'exigence centrale du pilote : une base qui expire au bout de 30 jours ne peut pas porter l'argent des membres. L'Option 2 est la seule qui respecte à la fois « gratuit », « sans carte » et « données durables ».

Son point faible est la dépendance à des offres gratuites sans garantie. On ne peut pas l'éliminer sans budget ; on la rend supportable : les sauvegardes partent chaque nuit hors de Supabase et de Render, la plus longue chaîne (mensuelle) existe chez deux fournisseurs (GitHub et Google), et un contrôle hebdomadaire prouve qu'elles se restaurent. Si un fournisseur change ses règles, on perd du temps, pas des données.

Les choix de détail suivent le code existant : l'image Docker du dépôt sert telle quelle, le stockage passe par l'API S3 pour rester portable, et les nouveaux réglages vivent dans `configurerApp` et `env.validation.ts` comme le reste.

## References

**Project sources**:
- `Dockerfile`, `docker-entrypoint.sh` (migrations au démarrage), `docker-compose.prod.yml`, `Caddyfile`, `scripts/backup.sh`
- `src/app.setup.ts` (`configurerApp`), `src/config/env.validation.ts`, `src/modules/media/media.service.ts`
- `docs/scope/scope.md` : fonctions 6 (APDP), 7 (sauvegardes testées), 8 (suivi des erreurs), L (déploiement existant)
- Revue `docs/reviews/2026-10-29-feat-rapport-caisse.md`

**Practices & standards**:
- Sauvegardes hors du fournisseur principal, chiffrées, et restauration testée régulièrement
- Rotation des sauvegardes en grand père, père, fils (quotidien, hebdomadaire, mensuel)
- `trust proxy` réglé par nombre de sauts, pas à `true`, derrière un proxy qui ajoute à `X-Forwarded-For`
- Moindre privilège : rôle Postgres en lecture seule pour les sauvegardes

**Links** (vérifiés le 2026-10-29) :
- Render, plan gratuit (sommeil après 15 minutes, 750 heures, Postgres gratuit qui expire après 30 jours, pas de disque) : https://render.com/docs/free
- Render, déploiements (Auto-Deploy « After CI Checks Pass ») : https://render.com/docs/deploys
- Render, spécification Blueprint (plan `free`, région `frankfurt`, 512 Mo) : https://render.com/docs/blueprint-spec
- Supabase, tarifs (500 Mo de base, 1 Go de stockage, pause après une semaine, pas de sauvegarde sur Free) : https://supabase.com/pricing
- Supabase, connexion à Postgres (IPv6 en direct, pooler IPv4 sur les ports 5432 et 6543) : https://supabase.com/docs/guides/database/connecting-to-postgres
- Supabase, Storage compatible S3 : https://supabase.com/docs/guides/storage/s3/compatibility
- Prisma avec Supabase (`pgbouncer=true`, URL directe pour les migrations) : https://www.prisma.io/docs/orm/overview/databases/supabase
- GitHub, Releases (pas de limite de taille totale, 2 Gio par fichier) : https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases
- UptimeRobot, tarifs (gratuit sans carte, contrôle toutes les 5 minutes) : https://uptimerobot.com/pricing/
- Healthchecks.io, tarifs (20 checks gratuits) : https://healthchecks.io/pricing/
- Sentry, tarifs (plan Developer gratuit) : https://sentry.io/pricing/
- rclone, Google Drive (jeton OAuth, identifiant client personnel) : https://rclone.org/drive/
