# 0004. Sauvegardes chiffrées et restauration testée

## Summary

Chaque nuit, chaque semaine et chaque mois, GitHub Actions copie la base (et les photos, à partir de l'hebdomadaire) depuis Supabase, chiffre l'archive et la garde dans un dépôt privé dédié, avec une copie mensuelle sur Google Drive. Avant de chiffrer, chaque workflow restaure la copie dans une base jetable pour prouver qu'elle marche. C'est la fonction 7 du scope.

## Requirements

**User stories**:
- En tant que responsable du pilote, je veux pouvoir retrouver toutes les données (mouvements d'argent et photos) même si Supabase ou Render disparaît, pour ne jamais perdre la trace d'un franc.
- En tant que responsable, je veux être prévenu si une sauvegarde ne s'est pas faite ou ne se restaure pas.
- En tant que responsable, je veux que même un pirate du dépôt de sauvegardes ne puisse rien lire.

**Acceptance criteria**:
- **AC-1**: Un dépôt GitHub **privé** `agbajowo-sauvegardes` contient les workflows et leurs secrets ; le dépôt du code n'en porte aucun.
- **AC-2**: Chaque nuit à 01:17 UTC (02:17 au Bénin), un dump de la base est fait, contrôlé (AC-5), chiffré avec `age` pour la clé publique du responsable, et gardé en artefact pendant **30 jours**.
- **AC-3**: Chaque dimanche à 02:17 UTC, une archive complète (dump et copie du bucket `photos`) est contrôlée, chiffrée et attachée à une Release `hebdo-<AAAA>-<SS>` (semaine ISO, `date -u +%G-%V`) ; les Releases `hebdo-*` créées il y a plus de **26 semaines** (champ `created_at`) sont supprimées avec leur tag (`gh release delete --cleanup-tag`).
- **AC-4**: Le 1er de chaque mois à 03:17 UTC, une archive complète contrôlée et chiffrée est attachée à une Release `mensuel-AAAA-MM`, jamais supprimée, et copiée dans le dossier `agbajowo-sauvegardes` d'un Google Drive personnel par `rclone`.
- **AC-5**: Avant chiffrement, chaque workflow restaure le dump **en clair, dans le runner**, dans un Postgres jetable de la même version majeure que Supabase, et vérifie pour `agents`, `membres`, `contrats`, `versements`, `avances` et `retraits` que `compte avant le dump ≤ compte restauré ≤ compte après le dump` (les tables n'ont que des suppressions logiques, donc les comptes ne font que croître). Un écart, ou un `pg_restore` en erreur, fait échouer le job ; le dump en clair n'est jamais envoyé ni gardé.
- **AC-6**: Chaque workflow signale son début, son succès ou son échec à Healthchecks.io (un check par fréquence) ; un check absent ou en échec envoie un e-mail (voir [0004-alertes.md](0004-alertes.md)).
- **AC-7**: Aucune archive ne quitte le runner sans être chiffrée ; la clé privée `age` n'est jamais dans GitHub, seulement hors ligne chez le responsable (gestionnaire de mots de passe et copie papier). Le workflow vérifie seulement que l'enveloppe chiffrée est valide (en tête `age`).
- **AC-8**: Un guide `docs/exploitation/restauration.md` (dans le dépôt du code) décrit la restauration complète d'une archive (déchiffrement avec la clé hors ligne, `pg_restore`, recopie des photos dans un bucket), et une restauration complète a été répétée une fois avant le pilote, avec sa date notée dans le guide.

## Design

**Rôle de lecture seule** (SQL donné dans le guide, lancé une fois dans l'éditeur SQL de Supabase) :
```sql
CREATE ROLE sauvegarde LOGIN PASSWORD '<fort>';
GRANT USAGE ON SCHEMA public TO sauvegarde;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO sauvegarde;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO sauvegarde;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON TABLES TO sauvegarde;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO sauvegarde;
```
Les droits par défaut couvrent les tables et séquences des migrations futures (`sync_seq`, `receipt_seq`, `membre_seq`, `agent_seq` comprises). RLS reste désactivé sur ces tables (spec mise en ligne, AC-5), sinon `pg_dump` échouerait. Au pooler, l'utilisateur est `sauvegarde.<ref>` ; l'URL en mode session est le secret `SAUVEGARDE_DATABASE_URL`.

**Commandes** : `pg_dump -Fc -n public --no-owner --no-privileges` ; restauration de contrôle avec `pg_restore --no-owner --no-acl --exit-on-error` dans une base vide (`createdb controle`, ce qui évite le conflit « schema public already exists » : on restaure dans le schéma `public` existant avec `--clean --if-exists`). Client Postgres installé depuis le dépôt apt PGDG (`postgresql-client-<majeure>`), et service du job `postgres:<majeure>`, la majeure étant celle notée à la première tâche de la mise en ligne.

**Photos** : `rclone` en remote S3 vers Supabase Storage, configuré par variables d'environnement : `provider = Other`, `endpoint` = `S3_ENDPOINT`, `region` = `S3_REGION`, `force_path_style = true`, `no_check_bucket = true`, clés S3 du projet. Ces clés donnent lecture et écriture sur tout le projet : c'est accepté et noté dans le guide (le plan gratuit n'offre pas de clé en lecture seule), avec une rotation si le dépôt de sauvegardes est compromis.

**Chiffrement** : `age`, une paire générée par le responsable. Seule la clé publique est dans GitHub (`AGE_RECIPIENT`).

**Workflows** (`.github/workflows/` du dépôt de sauvegardes, tous avec `workflow_dispatch` pour un lancement manuel) :

| Fichier | Cron (UTC) | Contenu | Destination | Durée |
|---|---|---|---|---|
| `quotidien.yml` | `17 1 * * *` | dump base | artefact `base-AAAA-MM-JJ.dump.age` | 30 jours (`retention-days: 30`) |
| `hebdomadaire.yml` | `17 2 * * 0` | dump base + photos (tar) | Release `hebdo-<AAAA>-<SS>` | 26 semaines, purge par le workflow |
| `mensuel.yml` | `17 3 1 * *` | dump base + photos (tar) | Release `mensuel-AAAA-MM` + Google Drive | sans limite |

Minutes décalées de `:00`, où GitHub lance souvent en retard. Ordre de chaque job : ping `start` → comptes avant → dump → comptes après → (photos) → restauration de contrôle → chiffrement → envoi → ping succès ; un pas en échec envoie `/fail` (étape `if: failure()`).

**Google Drive** : `rclone` avec un jeton OAuth obtenu une fois par `rclone authorize "drive"` sur un poste avec navigateur, avec un identifiant client OAuth créé par le responsable ; le `rclone.conf` entier est le secret `RCLONE_CONFIG`.

**Secrets du dépôt de sauvegardes** : `SAUVEGARDE_DATABASE_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `AGE_RECIPIENT`, `RCLONE_CONFIG`, `HC_PING_QUOTIDIEN`, `HC_PING_HEBDO`, `HC_PING_MENSUEL`.

**Budget GitHub** : environ 30 × 3 + 4 × 10 + 1 × 12 ≈ 150 minutes d'Actions par mois ; artefacts quotidiens de quelques Mo, loin des 500 Mo ; Releases sans limite de volume total.

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| dump | données | `SAUVEGARDE_DATABASE_URL` (rôle lecture seule) |
| photos | objets | bucket `S3_BUCKET` par `rclone` |
| contrôle | bornes de comptes | `SELECT count(*)` avant et après le dump |
| chiffrement | destinataire | `AGE_RECIPIENT` |
| nom hebdo | semaine | `date -u +%G-%V` |
| purge | âge | `created_at` de la Release |
| alerte | état | pings Healthchecks.io |

**Critical test scenarios**:
- Un lancement manuel de chaque workflow produit son archive chiffrée au bon endroit et des pings start puis succès, verifies **AC-2**, **AC-3**, **AC-4**, **AC-6**
- Une synchro pendant le dump ne fait pas échouer le contrôle ; un dump amputé d'une table le fait échouer (test volontaire, une fois), verifies **AC-5**
- L'archive téléchargée ne se lit pas sans la clé privée, et aucune clé privée n'est dans les secrets, verifies **AC-7**
- La restauration complète suivant le guide redonne une base et des photos utilisables par l'API en dev, verifies **AC-8**

## Build plan

1. Créer le dépôt privé, la paire `age` (clé privée hors ligne), le rôle `sauvegarde`, et les secrets, satisfies **AC-1**, **AC-7**
2. `quotidien.yml` avec contrôle de restauration et pings, lancé à la main une fois, satisfies **AC-2**, **AC-5**, **AC-6**, **AC-7**
3. `hebdomadaire.yml` avec photos, Release et purge, satisfies **AC-3**, **AC-5**, **AC-6**
4. `mensuel.yml` avec Release et copie Google Drive, satisfies **AC-4**, **AC-6**
5. Guide `docs/exploitation/restauration.md` et exercice de restauration complète noté, satisfies **AC-8**

## Rationale (short)

Supabase gratuit n'a pas de sauvegarde automatique. Les Releases contournent le quota d'artefacts, la copie sur Drive protège contre la perte du compte GitHub. Contrôler la restauration sur le dump en clair, avant de chiffrer, évite de mettre la clé privée dans GitHub : un pirate du dépôt n'obtient que des archives illisibles.
