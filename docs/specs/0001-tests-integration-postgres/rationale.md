# 0001. Tests d'intégration sur un Postgres jetable : décision

## Context

Le pilote terrain arrive dans moins d'un mois, avec un critère de réussite très net : zéro écart de caisse. Or tout ce qui touche l'argent (encaissement, avance, retrait) vit dans des services qui combinent plusieurs couches : guards JWT et rôles globaux, validation Zod, `$transaction` Prisma, séquences Postgres (`receipt_seq`, `sync_seq`) et filtre d'erreurs. Les tests actuels couvrent le domaine pur (`src/domain/*.spec.ts`) et quelques services avec un Prisma simulé. Une erreur dans une requête Prisma, une contrainte d'unicité, une séquence absente ou un guard mal câblé passe donc la CI sans être vue.

Le projet est développé par une seule personne, et chaque fonction suivante du scope (rapport de caisse, journal d'audit, clôture) touche l'argent et devra être prouvée de la même façon. Il faut donc un harnais simple, réutilisable, qui tourne pareil en local et dans GitHub Actions, sans jamais risquer de toucher la base de développement ni celle de production.

Deux contraintes du code existant pèsent sur la conception. D'abord, la configuration de l'app (préfixe `api/v1`, filtre d'erreurs global, sérialisation des `BigInt`) vit dans `main.ts` : une app de test montée autrement ne se comporterait pas comme la prod. Ensuite, `POST /auth/login` est limité à 10 appels par minute, et la limite globale à 100 par minute, ce qui fait échouer une suite qui se connecte à chaque test.

Un risque réel est déjà visible : `RetraitsService.effectuer` lit les agrégats du contrat sans verrouiller sa ligne, donc deux retraits simultanés pourraient passer tous les deux. Ce spec ne le teste pas (le retrait est hors de cette livraison), mais le harnais doit permettre de l'écrire ensuite.

## Options considered

### Option 1: Testcontainers, TRUNCATE avant chaque test, suite séparée

Un `globalSetup` Jest démarre un conteneur `postgres:16-alpine` via `@testcontainers/postgresql`, applique les migrations, puis expose l'URL de connexion par `process.env.DATABASE_URL`. Chaque test démarre sur une base vide grâce à un `TRUNCATE` de toutes les tables métier. Les tests vivent dans `test/integration/`, avec leur propre config Jest et leur propre script.

**Pros**:
- La même commande marche en local et en CI, sans base à préparer.
- La base de développement et la production ne peuvent pas être touchées : l'URL vient toujours d'un conteneur jetable.
- Le `TRUNCATE` reste compatible avec les `$transaction` des services et avec de futurs tests de concurrence.

**Cons**:
- Docker est requis pour lancer la suite, et le démarrage du conteneur ajoute quelques secondes.
- Les tests tournent en série, donc la suite ralentit à mesure qu'elle grandit.

### Option 2: Service Postgres de la CI et base `agbajowo_test` en local

La CI déclare un conteneur service Postgres dans `ci.yml` (comme le prévoit déjà son commentaire), et en local le développeur crée une base `agbajowo_test` dans son `docker compose`.

**Pros**:
- Pas de nouvelle dépendance de test.
- Démarrage un peu plus rapide en CI, car le service est déjà prêt.

**Cons**:
- Deux configurations à maintenir (CI et local) qui finissent par diverger.
- Une erreur d'URL en local peut vider la base de développement.

### Option 3: Transaction annulée à la fin de chaque test

Chaque test s'exécute dans une transaction ouverte puis annulée, au lieu d'un `TRUNCATE`.

**Pros**:
- Isolation très rapide, sans vider les tables.

**Cons**:
- Les services ouvrent leurs propres `$transaction` : il faudrait injecter un client transactionnel partout, ce qui touche le code de prod.
- Rend impossibles les tests de concurrence, qui demandent plusieurs connexions réelles.

## Rationale

Le critère du pilote est la justesse de la caisse, et cette justesse dépend de ce qui se passe dans la base : contraintes d'unicité, séquences, transactions. Seul un vrai Postgres le prouve. Testcontainers donne ce vrai Postgres avec une seule commande, identique en local et en CI, et rend impossible l'accident le plus grave pour un développeur seul : lancer un `TRUNCATE` sur la mauvaise base. L'option 2 coûte moins au démarrage, mais elle double la configuration et laisse ce risque ouvert.

Le `TRUNCATE` est préféré à la transaction annulée parce que les services ouvrent eux mêmes leurs `$transaction` et que la suite devra bientôt tester la concurrence (deux retraits simultanés). Une base vidée avant chaque test garde les tests indépendants sans toucher au code de prod. Avec au plus quelques dizaines de tests au pilote, l'exécution en série reste rapide ; on parallélisera seulement quand la durée deviendra un vrai problème.

Les tests passent d'abord par HTTP, parce que c'est le seul niveau qui prouve le fil complet (guards, Zod, filtre d'erreurs, service, base), ce que veut l'approche Tracer Bullet. Pour que ce fil soit fidèle, la configuration de `main.ts` est extraite dans `configurerApp`, appelée par la prod et par les tests. La neutralisation de la limite de débit garde la suite indépendante de son nombre de tests, et un test dédié empêche qu'on la perde en prod.

Choix faits ici, sans question au développeur :
- **Neutraliser la limite de débit** : enregistrer `ThrottlerGuard` comme provider et le déclarer en `APP_GUARD` via `useExisting`, pour que les tests le remplacent par `overrideProvider(ThrottlerGuard)`. Second choix : ajouter une variable d'env qui désactive la limite, écarté car elle pourrait être activée par erreur en prod.
- **Logs en test** : app de test créée avec le logger Nest désactivé, pour que les avertissements 4xx du filtre ne noient pas la sortie Jest. Second choix : ne garder que le niveau `error`.
- **Liste des tables à vider** : lue dans `pg_tables` (schéma `public`, sauf `_prisma_migrations`), puis un seul `TRUNCATE ... CASCADE`. Les séquences ne sont pas remises à zéro, donc les tests vérifient le format du reçu, jamais un numéro exact. Second choix : une liste de tables écrite en dur, écartée car elle oublierait les futures tables.
- **Config Jest** : un fichier `test/jest-int.json` (JSON, pour ne pas dépendre de ts-node) avec `testTimeout` à 30 secondes, et `--runInBand` dans le script.
