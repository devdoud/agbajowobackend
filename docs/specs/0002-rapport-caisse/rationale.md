# 0002. Rapport de caisse : raisonnement

## Context

Le pilote terrain arrive dans moins d'un mois avec un seul critère de réussite : zéro écart de caisse. Chaque soir, un agent remet l'argent collecté. Aujourd'hui, personne ne peut dire combien il devrait remettre : les versements, avances et retraits sont en base, mais aucune route ne les regroupe par agent et par jour. Sans ce chiffre, un écart passe inaperçu, ou bien il est découvert trop tard pour être expliqué.

Trois faits du code pèsent sur la conception. D'abord, l'app agent travaille hors ligne : chaque mouvement porte une date terrain envoyée par le téléphone (`paidAt`, `dateAvance`, `dateRetrait`) et une date de réception serveur (`createdAt`), qui peuvent différer de plusieurs jours. Ensuite, le code calcule « aujourd'hui » avec l'heure du serveur, et l'image Docker ne fixe aucun fuseau : le serveur tourne en UTC, alors que le Bénin est en UTC+1. Enfin, un mouvement porte l'agent qui l'a fait (`agentId`), qui n'est pas toujours le propriétaire du contrat.

La fonction 9 vient de montrer qu'opérations simultanées et argent se mélangent mal : le rapport lit trois tables pendant que des synchros écrivent. Un rapport dont les totaux ne collent pas à ses propres lignes ressemblerait à un écart et détruirait la confiance dans l'outil.

Avec au plus 10 agents et quelques centaines de membres, le volume est faible : quelques centaines de mouvements par jour.

## Options considered

### Option 1: Rapport calculé à la volée, totaux tirés des lignes

À chaque appel, le service lit les mouvements du jour dans un seul instantané Postgres (`RepeatableRead`) et une fonction pure du domaine additionne les lignes mêmes qu'il renvoie.

**Pros**:
- Toujours juste : aucune valeur stockée ne peut vieillir, une correction de mouvement corrige le rapport.
- Totaux et lignes ne peuvent pas diverger, par construction.
- Aucune nouvelle table, une seule migration d'index.

**Cons**:
- Le rapport d'un jour passé change si une synchro arrive tard.
- Le calcul est refait à chaque appel (négligeable au pilote, à mesurer plus tard).

### Option 2: Agrégats SQL séparés

Trois requêtes `SUM ... GROUP BY agent_id` pour les totaux, et une requête à part pour les lignes.

**Pros**:
- La base fait l'addition, moins de données transférées pour la synthèse.

**Cons**:
- Sans instantané commun, une synchro entre deux requêtes donne des totaux qui ne collent pas aux lignes.
- Deux chemins de calcul (SQL pour la synthèse, code pour le détail) qui peuvent diverger avec le temps.

### Option 3: Clôture journalière stockée

Un job (ou une action du superviseur) fige chaque soir les totaux de chaque agent dans une table `clotures_caisse`.

**Pros**:
- Un jour passé ne bouge plus, l'historique est stable.
- Base naturelle pour enregistrer la remise et son écart.

**Cons**:
- Une synchro tardive arrive après la clôture : il faut un mécanisme de réouverture ou d'ajustement, sinon l'argent collecté disparaît du rapport.
- Nouvelle table, job planifié, règles de réouverture : beaucoup plus de surface avant le pilote.

## Rationale

L'Option 1 répond au vrai besoin, savoir chaque soir combien un agent doit remettre, avec le moins de pièces mobiles. Le volume du pilote rend le calcul à la volée gratuit, et le choix de la date terrain (l'argent a changé de mains ce jour là) impose de toute façon qu'un jour passé puisse évoluer : un stockage figé (Option 3) devrait gérer la réouverture dès le premier jour hors ligne. On rend plutôt ce mouvement visible avec `arriveesTardives`, ce qui suffit au superviseur pour distinguer une synchro tardive d'un écart.

L'instantané unique et les totaux tirés des lignes écartent l'Option 2 : après la fonction 9, on ne veut aucune réponse où l'outil lui même fabrique un écart apparent. La synthèse réutilise la même fonction du domaine que le détail, ce qui garantit qu'un superviseur voit le même chiffre dans les deux écrans.

Le fuseau fixe UTC+1 du Bénin est une constante du domaine plutôt que l'heure du serveur, parce que le conteneur tourne en UTC : sinon, les mouvements entre minuit et une heure tomberaient sur la veille. Le choix de ne pas paginer va contre la règle générale « toute liste se pagine » : on l'assume parce qu'une réponse unique garde les lignes et les totaux ensemble pour le rapprochement, et qu'une journée d'agent tient en quelques centaines de lignes au pilote. Enfin, enregistrer la remise elle même est la suite naturelle (elle donnerait la preuve complète), mais elle ajoute une écriture d'argent qui doit passer par le journal d'audit : elle vient après, comme fonction à part.
