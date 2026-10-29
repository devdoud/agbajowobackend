# Domaine (règles métier pures)

## Overview

Les règles de la tontine écrites en fonctions pures : commission, avance et intérêt, retrait, statut de collecte, numérotation des mises, relevé, statistiques, paramètres par groupe. Ce dossier ne dépend ni de NestJS ni de Prisma, ce qui le rend simple à tester et réutilisable.

## Key files

| File | Owns |
|---|---|
| `types.ts` | Types partagés du domaine (`Groupe`, `Cadence`, `StatutCollecte`) |
| `parametres-groupe.ts` | Paramètres propres à `GROUPE_1` / `GROUPE_2`, date d'échéance |
| `commission.ts` | Commission (règle R2) |
| `credit.ts` | Avances et intérêt (règle R10) |
| `retrait.ts` | Retrait total ou partiel, net récupérable (règle R9) |
| `statut.ts` | Statut de collecte selon la cadence (règle R3) |
| `mises.ts` | Plage de numéros de mises d'un versement |
| `dates.ts` | Helpers de dates déterministes |
| `releve.ts`, `stats.ts` | Relevé d'un contrat, agrégats du tableau de bord |

## Conventions

- Aucun import de `@nestjs/*` ni de `@prisma/client`. Entrées et sorties en types simples.
- Jamais de `new Date()` implicite : la date de référence est un paramètre. Les services la fournissent via `ClockService.now()`.
- Montants en `number` (FCFA entiers). La conversion depuis les `BigInt` Prisma se fait dans le service, pas ici.
- Chaque fichier a son `*.spec.ts` à côté. Toute règle modifiée ou ajoutée vient avec son test.
- Les commentaires citent l'identifiant de règle métier (`R2`, `R3`, `R9`, `R10`) : le garder à jour.

## Gotchas

- Un montant net n'est jamais négatif (`Math.max(0, ...)`), c'est une règle métier.
- Au retrait, la commission et l'intérêt restants sont prélevés en priorité et une seule fois, que le retrait soit total ou partiel. Le net partiel demandé ne doit pas dépasser `recuperableNet` : c'est à l'appelant de le vérifier.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
