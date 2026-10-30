# Scope: Agbajowo backend

API de la plateforme de tontine Agbajowo. Elle sert aux agents terrain qui collectent les mises des membres (en ligne ou hors ligne), et aux superviseurs et admins qui suivent les comptes. Ce scope couvre ce dépôt backend seulement ; l'app agent et le back office ont leurs propres dépôts.

**Build approach:** Tracer Bullet (chaque fonction est construite de bout en bout, du schéma à la route testée, et marche réellement).
**Workflow:** Beta (après `/develop` : `/check verify`, puis `/test`). C'est le niveau de rigueur par défaut du projet. `/architect` est le premier arrêt conseillé quand une fonction porte une vraie décision, mais tu peux le sauter si tu sais déjà comment la construire. Une fonction peut porter son propre tag (par exemple `· GA`) pour faire plus ou moins.

**Prochain jalon : pilote terrain** dans moins d'un mois, avec au plus 10 agents et quelques centaines de membres. Critère de réussite : **zéro écart de caisse**, ce qui veut dire que l'argent collecté sur le terrain correspond toujours aux montants en base.

_Ce sont des recommandations pour garder ton build ordonné, pas des obligations. Saute ce qui ne colle pas : si tu sais déjà construire une fonction, passe directement par `/develop` sans `/architect`. C'est toi qui décides quand une fonction est `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| A | Socle technique | Foundation | existing |
| B | Authentification des agents | Existant | existing |
| C | Comptes agents | Existant | existing |
| D | Membres | Existant | existing |
| E | Contrats et relevés | Existant | existing |
| F | Collecte des versements | Existant | existing |
| G | Avances | Existant | existing |
| H | Retraits | Existant | existing |
| I | Médias (photos) | Existant | existing |
| J | Synchronisation hors ligne | Existant | existing |
| K | Tableau de bord | Existant | existing |
| L | Sécurité et déploiement VPS | Existant | existing |
| 1 | Tests d'intégration sur Postgres | Foundation | done |
| 2 | Rapport de caisse par agent et par jour | Slice 1 | in-progress |
| 3 | Journal d'audit des mouvements | Slice 2 | planned |
| 4 | Clôture de contrat | Slice 3 | planned |
| 5 | Modifier et archiver membres et contrats | Slice 4 | planned |
| 6 | Socle données personnelles | Slice 5 | planned |
| 7 | Sauvegardes testées | Slice 6 | in-progress |
| 8 | Suivi des erreurs | Slice 6 | in-progress |
| 9 | Tests d'intégration : retrait et concurrence | Foundation | done |
| 10 | Remise de caisse du soir | Slice 1 | planned |
| 11 | Verrou de contrat sur les avances | Foundation | done |
| 12 | Règles des dates terrain | Foundation | done |
| 13 | Mise en ligne gratuite (Render, Supabase) | Foundation | in-progress |

## Déjà construit

Enregistré pour le contexte. Ces fonctions existaient avant ce workflow (lots L1 à L12) ; `/develop` et `/sync` ne les modifient pas.

### A. Socle technique · existing
NestJS 11, Prisma 6 et PostgreSQL 16, validation Zod, domaine métier pur et testé, CI (lint, format, build, test), conventions dans `AGENTS.md`. code in `./`, `prisma/`, `src/domain/`

### B. Authentification des agents · existing
Connexion par téléphone et mot de passe, jetons d'accès et de rafraîchissement, déconnexion, changement de mot de passe obligatoire au premier accès. code in `src/modules/auth/`

### C. Comptes agents · existing
Création, liste et modification des comptes. L'ADMIN gère tous les rôles, le SUPERVISEUR ne gère que des comptes AGENT, et personne ne peut modifier son propre compte. code in `src/modules/agents/`

### D. Membres · existing
Création (champs facultatifs, code court hors ligne), recherche et fiche membre. La modification passe seulement par la synchro. code in `src/modules/membres/`

### E. Contrats et relevés · existing
Souscription par groupe, lectures des versements, avances, retraits et relevé d'un contrat. code in `src/modules/contrats/`

### F. Collecte des versements · existing
Encaissement idempotent de mises, numéro de reçu officiel, passage du contrat en TERMINE quand l'objectif est atteint. code in `src/modules/collecte/`

### G. Avances · existing
Accord d'une avance avec intérêt, remboursée au retrait. code in `src/modules/avances/`

### H. Retraits · existing
Retrait total ou partiel ; la commission et l'intérêt sont prélevés en priorité, et le net n'est jamais négatif. code in `src/modules/retraits/`

### I. Médias (photos) · existing
Envoi et lecture des photos des membres, avec une taille limitée. code in `src/modules/media/`

### J. Synchronisation hors ligne · existing
Push par lot avec gestion des conflits et pull par curseur `server_seq`. Les paramètres d'un contrat sont verrouillés dès qu'il a un mouvement. code in `src/modules/sync/`

### K. Tableau de bord · existing
Statistiques et file de collecte, filtrées selon le rôle. code in `src/modules/dashboard/`

### L. Sécurité et déploiement VPS · existing
helmet, limite de débit, filtre d'erreurs uniforme, identifiant de requête, Docker et Caddy en HTTPS, script de sauvegarde. code in `src/main.ts`, `Dockerfile`, `docker-compose.prod.yml`, `scripts/`

## Foundations

### 1. Tests d'intégration sur Postgres · done
Tester les services contre une vraie base dans la CI, pour que chaque fonction du pilote qui touche l'argent soit prouvée de bout en bout, et pas seulement dans le domaine pur.
**Done when:** `npm run test:int` lance des tests HTTP sur un Postgres jetable, en local comme dans la CI, et l'encaissement y est couvert (le retrait suit en fonction 9).
- [x] Design it (spec): `/architect tests d'intégration sur Postgres`
- [x] Build it: `/develop tests d'intégration sur Postgres`
   - [x] Préparer le code de prod : `configurerApp` extrait de `main.ts`, guard de limite remplaçable (AC-4, AC-5)
   - [x] Harnais : config Jest, conteneur, migrations, env de test, helpers et fabriques (AC-1, AC-2, AC-3, AC-11)
   - [x] Fil encaissement : nominal, idempotence, objectif et statut (AC-5, AC-7, AC-8, AC-9)
   - [x] Erreurs d'API, test de la limite de débit, étape CI (AC-6, AC-10, AC-12)
- [x] Verify it: `/check verify tests d'intégration sur Postgres`
- [x] Test it: `/test tests d'intégration sur Postgres`
Spec [0001](../specs/0001-tests-integration-postgres/index.md) · code in `test/`, `src/app.setup.ts`

### 9. Tests d'intégration : retrait et concurrence · done · from spec 0001
Épaissir le harnais de la fonction 1 avec le retrait, puis deux retraits et deux encaissements simultanés sur un même contrat. Le retrait lit ses agrégats sans verrouiller la ligne du contrat : ce test dira s'il faut un verrou. À faire avant le pilote, car c'est le risque le plus direct sur la caisse.
**Done when:** le retrait total et partiel est couvert sur une vraie base, et deux opérations simultanées sur un même contrat ne produisent ni dépassement ni double retrait.
- [x] Build it: `/develop tests d'intégration : retrait et concurrence`
Spec [0001](../specs/0001-tests-integration-postgres/index.md) · code in `test/integration/`, `src/common/verrou-contrat.ts`

### 11. Verrou de contrat sur les avances · done · from spec 0002
L'avance lit les avances et le solde du contrat sans le verrou ajouté au retrait et à l'encaissement en fonction 9. Une avance et un retrait simultanés peuvent encore créer un écart. Même correctif (`verrouillerContrat` en tête de transaction) et un test de concurrence sur le harnais existant.
**Done when:** une avance simultanée à un retrait ou à une autre avance sur le même contrat ne dépasse ni `maxAvances` ni le récupérable, prouvé par un test d'intégration.
- [x] Build it: `/develop verrou de contrat sur les avances`
Spec [0002](../specs/0002-rapport-caisse/index.md) (suivi) · code in `src/modules/avances/avances.service.ts`, `test/integration/concurrence.int-spec.ts`

### 12. Règles des dates terrain · done · from spec 0003
Contrôler la date terrain des versements, avances et retraits, qui décide du jour où l'argent compte dans le rapport de caisse : format ISO avec fuseau, au plus 15 minutes dans le futur, au plus 30 jours dans le passé, pas avant le début du contrat. En synchro, un mouvement mal daté devient un conflit sans bloquer le lot. Trouvé par les revues du rapport de caisse, à faire avant le pilote.
**Done when:** aucune date `null`, sans fuseau, future ou trop ancienne n'est enregistrée, en direct comme en synchro ; un mouvement mal daté est un conflit visible et ne bloque jamais une synchro.
- [x] Design it (spec): `/architect règles des dates terrain`
- [x] Build it: `/develop règles des dates terrain`
   - [x] Règle du domaine et horloge fixe dans le harnais (AC-1, AC-3, AC-4, AC-5, AC-10, AC-11)
   - [x] Fil versement de bout en bout (AC-1, AC-2, AC-3, AC-4, AC-5, AC-8, AC-9, AC-11)
   - [x] Avances et retraits (AC-1 à AC-5, AC-8)
   - [x] Synchro par mouvement et script smoke (AC-6, AC-7, AC-8, AC-11)
- [x] Verify it: `/check verify règles des dates terrain`
- [x] Test it: `/test règles des dates terrain`
Spec [0003](../specs/0003-regles-dates-terrain/index.md) · code in `src/domain/date-terrain.ts`, `src/common/schemas/date-terrain.schema.ts`, `src/modules/sync/sync.service.ts`, services collecte, avances et retraits

### 13. Mise en ligne gratuite (Render, Supabase) · in-progress · from spec 0004
Mettre l'API en ligne pour le pilote sans budget ni carte bancaire : API sur Render gratuit, base et photos sur Supabase gratuit, déploiement automatique après la CI verte. Elle ouvre les fonctions 7 et 8, qui en dépendent.
**Done when:** l'API répond en HTTPS sur le domaine du pilote, avec la base vérifiée dans la santé, les photos dans Supabase Storage, la limite de débit par client, le Data API de Supabase fermé, et un premier compte admin ; un merge sur `main` avec la CI verte redéploie tout seul.
- [x] Design it (spec): `/architect hébergement gratuit`
- [ ] Build it: `/develop mise en ligne gratuite`
   - [x] Isolation des tests, nouvelles variables d'env, `directUrl`, `trust proxy` (AC-1, AC-2, AC-9, AC-12)
   - [x] Photos dans Supabase Storage par un pilote de stockage (AC-3, AC-4)
   - [x] Data API fermé, santé avec la base, date Bénin des reçus, script du premier admin (AC-5 à AC-8)
   - [ ] Blueprint Render, guide de mise en ligne, première mise en ligne (AC-10, AC-11)
- [ ] Verify it: `/check verify mise en ligne gratuite`
- [ ] Test it: `/test mise en ligne gratuite`
Spec [0004](../specs/0004-hebergement-gratuit/0004-mise-en-ligne.md) (parapluie [index](../specs/0004-hebergement-gratuit/index.md)) · code in `src/app.setup.ts`, `src/config/env.validation.ts`, `src/modules/media/stockage/`, `src/health/`, `src/common/receipt.ts`, `src/modules/agents/premier-admin.ts`, `scripts/creer-admin.ts`, `prisma/migrations/20261030090000_fermer_data_api_supabase/`, `render.yaml`, `docs/exploitation/mise-en-ligne.md`

## Slice 1: Rapport de caisse

### 2. Rapport de caisse par agent et par jour · in-progress · GA
Le fil central du pilote : pour un agent et une journée, ce qu'il a encaissé, ce qu'il a versé en avances et en retraits, et le solde qu'il doit remettre. C'est la preuve quotidienne du zéro écart.
**Done when:** un superviseur obtient pour un agent et une date le total encaissé, le total décaissé et le solde attendu, avec le détail des reçus ; un agent ne voit que son propre rapport ; les totaux concordent avec les mouvements en base.
- [x] Design it (spec): `/architect rapport de caisse`
- [x] Build it: `/develop rapport de caisse`
   - [x] Domaine : jour du Bénin, bornes, calcul des totaux (AC-1, AC-3, AC-5, AC-6)
   - [x] Fil détail de bout en bout : module `caisse`, route agent, lignes et totaux (AC-1, AC-2, AC-4, AC-7, AC-12)
   - [x] Règles du détail : date par défaut et refusée, portée, frontière du jour, synchro tardive (AC-3, AC-5, AC-6, AC-8, AC-9)
   - [x] Synthèse de tous les agents d'une journée (AC-4, AC-10)
   - [x] Migration des trois index (AC-11)
   - [x] Réceptions tardives le jour où elles arrivent, avec leur index (AC-13 à AC-18)
- [x] Verify it: `/check verify rapport de caisse`
- [x] Test it: `/test rapport de caisse`
- [x] Review it (fresh model): `/check review rapport de caisse`
- [x] Document it: `/document rapport de caisse`
Spec [0002](../specs/0002-rapport-caisse/index.md) · code in `src/modules/caisse/`, `src/domain/caisse.ts`, `prisma/migrations/20261029120000_index_rapport_caisse/`, `prisma/migrations/20261029130000_index_reception_mouvements/`

### 10. Remise de caisse du soir · needs a decision · from spec 0002
Enregistrer l'argent qu'un agent remet le soir, qui l'a reçu, et l'écart avec le solde attendu du rapport de caisse. C'est la preuve complète du zéro écart ; elle s'appuie sur le journal d'audit (fonction 3).
**Done when:** un superviseur enregistre la remise d'un agent pour une date ; l'écart avec le solde attendu est calculé et conservé ; la remise est tracée dans le journal d'audit.
- [ ] Design it (spec): `/architect remise de caisse du soir`

## Slice 2: Journal d'audit

### 3. Journal d'audit des mouvements · needs a decision · GA
Tracer qui a fait quoi et quand sur chaque mouvement d'argent et chaque changement de contrat, pour que les écarts soient explicables. Il passe avant la clôture et l'édition, pour que ces actions soient tracées dès le premier jour.
**Done when:** chaque versement, avance, retrait, clôture et modification laisse une entrée non modifiable (auteur, action, avant et après, date) ; un superviseur peut la consulter par contrat et par agent.
- [ ] Design it (spec): `/architect journal d'audit`

## Slice 3: Clôture de contrat

### 4. Clôture de contrat · needs a decision · GA
Permettre de clôturer un contrat et d'en souscrire un nouveau, comme le demande déjà le message du verrou d'intégrité. Il faut décider des règles de solde, de commission et d'avance restante.
**Done when:** un contrat actif peut être clôturé selon des règles métier testées dans `src/domain/` ; un contrat clôturé refuse tout nouveau mouvement ; la clôture remonte par la synchro et entre dans le journal d'audit.
- [ ] Design it (spec): `/architect clôture de contrat`

## Slice 4: Édition

### 5. Modifier et archiver membres et contrats · needs a decision
Corriger une fiche membre ou un contrat sans mouvement, et archiver ce qui n'a plus lieu d'être, directement par l'API et pas seulement par la synchro.
**Done when:** un membre et un contrat se modifient et s'archivent par l'API en respectant le verrou d'intégrité et la portée par rôle ; les changements remontent au pull et sont tracés dans le journal d'audit.
- [ ] Design it (spec): `/architect modifier et archiver membres et contrats`

## Slice 5: Données personnelles

### 6. Socle données personnelles · needs a decision
Le minimum pour traiter les données des membres proprement pendant le pilote (loi béninoise, APDP).
**Done when:** le consentement du membre est enregistré et daté ; une durée de conservation est définie et documentée ; un admin peut exporter toutes les données d'un membre sur demande.
- [ ] Design it (spec): `/architect socle données personnelles`

## Slice 6: Exploitation

### 7. Sauvegardes testées · in-progress
Le script de sauvegarde existe, mais rien ne prouve qu'une restauration marche. Il faut le planifier, garder une copie hors du serveur, et répéter une restauration.
**Done when:** la sauvegarde de la base et des médias tourne chaque jour, une copie existe hors du VPS, et une restauration complète a été répétée et documentée.
- [x] Design it (spec): `/architect sauvegardes testées`
- [ ] Build it: `/develop sauvegardes testées`
   - [ ] Dépôt privé, clé `age` hors ligne, rôle de lecture seule, secrets (AC-1, AC-7)
   - [ ] Sauvegarde quotidienne avec contrôle de restauration (AC-2, AC-5, AC-6)
   - [ ] Sauvegardes hebdomadaire et mensuelle, Releases, purge, Google Drive (AC-3, AC-4, AC-6)
   - [ ] Guide de restauration et exercice complet noté (AC-8)
- [ ] Verify it: `/check verify sauvegardes testées`
- [ ] Test it: `/test sauvegardes testées`
Spec [0004](../specs/0004-hebergement-gratuit/0004-sauvegardes.md) (parapluie [index](../specs/0004-hebergement-gratuit/index.md)) · dépend de la fonction 13

### 8. Suivi des erreurs · in-progress
Être prévenu vite quand l'API tombe ou renvoie des erreurs 500 pendant le pilote.
**Done when:** une erreur serveur ou une panne de `/api/v1/health` déclenche une alerte en quelques minutes, avec l'identifiant de requête pour retrouver le contexte.
- [x] Design it (spec): `/architect suivi des erreurs`
- [ ] Build it: `/develop suivi des erreurs`
   - [ ] `requestId` limité aux UUID, Sentry sans données personnelles, envoi des 5xx (AC-2 à AC-5)
   - [ ] Comptes et alertes UptimeRobot, Sentry, Healthchecks.io, test de bout en bout (AC-1, AC-6, AC-7, AC-8)
- [ ] Verify it: `/check verify suivi des erreurs`
- [ ] Test it: `/test suivi des erreurs`
Spec [0004](../specs/0004-hebergement-gratuit/0004-alertes.md) (parapluie [index](../specs/0004-hebergement-gratuit/index.md)) · dépend de la fonction 13

## Deferred
Hors de la tranche pilote, gardé pour que le plan reste honnête.
- **Notifications membres** : reçu ou alerte par SMS ou WhatsApp après un versement ou un retrait · needs a decision
- **Exports CSV et PDF** : rapports téléchargeables pour le superviseur · needs a decision
- **Tests de portée par rôle sur tous les modules** : AGENT, SUPERVISEUR et ADMIN sur chaque route, sur le harnais de la spec 0001 · from spec 0001
- **Données personnelles complètes** : déclaration APDP, chiffrement des champs sensibles, effacement à la demande · needs a decision · GA
- **Jour du Bénin partout** : réutiliser `jourBenin` dans le reste du code qui calcule « aujourd'hui » avec l'heure du serveur (statut de collecte, tableau de bord) · from spec 0002
- **Téléphone mal réglé** : signaler un mouvement dont la date terrain s'écarte trop de sa réception serveur · from spec 0002 · repris par la fonction 12 (refus des dates hors bornes)

## Legend

**The decision box.** Chaque fonction a exactement une case dont le libellé finit par `(spec)`. Les skills la repèrent par ce suffixe. Toutes les autres cases sont des cases d'exécution, et `/architect` n'en coche jamais.

**Feature lifecycle** :

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | une case : `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | `/architect` à la capture du spec | `Design it` cochée ; spec lié ; `Build it: /develop <feature>` + 2 à 5 jalons ; les cases de fin du niveau (`Verify it` dès Alpha, `Test it` dès Beta, `Review it` + `Document it` en GA) |
| `in-progress` (building) | `/develop` | les jalons se cochent un par un ; le pointeur de code est rempli |
| `in-progress` (verified) | `/check verify` | `Build it` et ses jalons cochés ; `Verify it` cochée |
| `done` | toi, quand tu le décides ; `/sync` réconcilie | les cases lancées sont cochées, celles sautées sont marquées ; la dernière étape du niveau (`Beta`/`GA` → après `/test`) est le moment conseillé |

- **Next step** = la première case non cochée (toujours une commande ou un jalon suivi).
- **needs a decision** = lance `/architect` d'abord ; sinon directement `/develop`. Le tag disparaît quand le spec est capturé.
- **Les tâches de build détaillées vivent dans la section `## Build plan` du spec**, pas ici : le scope ne garde que les jalons.
- **Status** : `planned` → `in-progress` → `done`, plus `existing` (avant le workflow) et `dropped` (retiré, gardé pour l'historique).
- **Workflow tier tag** (par exemple `· GA`) : fixe la rigueur d'une fonction au dessus ou en dessous du défaut ; sans tag, elle hérite du défaut.
- **Workflow** (ligne d'en tête) : le défaut du projet après `/develop`. **Prototype** = rien ; **Alpha** = `/check verify` ; **Beta** = `/check verify` puis `/test` ; **GA** = en plus `/check review` sur un modèle neuf, puis `/document`. Une fonction construite sur un spec `Assumed` reste signalée, sans que cela bloque `done`.
- **Pointer line** (`spec <n> · code in <path>`) : le lien du spec est ajouté par `/architect`, le chemin du code par `/develop`.
