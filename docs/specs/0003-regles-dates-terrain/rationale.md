# 0003. Règles des dates terrain : raisonnement

## Context

Le rapport de caisse (spec 0002) range chaque mouvement dans un jour du Bénin d'après sa date terrain, envoyée par le téléphone. Deux revues de code (Sonnet, puis Fable, le 2026-10-29) ont montré que cette date n'est pas contrôlée. Les DTO utilisent `z.coerce.date().optional()` : `null` passe et devient `1970-01-01T00:00:00Z`, un nombre passe aussi, et une chaîne sans fuseau (`2026-10-29T23:30:00`) est lue à l'heure du serveur, UTC+1 sur un poste de dev et UTC dans le conteneur de prod. Le même paiement de 23:30 change donc de jour entre le dev et la prod, et les tests ne le voient pas : les tests du rapport posent leurs mouvements par les fabriques, directement en base, sans passer par les DTO.

Une date future est pire : le rapport refuse les jours futurs (spec 0002, AC-8), donc un mouvement daté de demain n'apparaît dans aucun rapport et ne porte aucun signal. L'argent est encaissé, il manque au solde du jour, et rien ne l'explique. C'est exactement l'écart que le pilote doit éviter.

La synchro hors ligne pèse aussi sur la conception. Le push valide tout le lot avec un seul schéma Zod : une erreur de validation sur un seul mouvement fait échouer tout le push en 400, et l'agent ne synchronise plus rien. À l'inverse, une erreur levée par un service métier devient un conflit `{ entity, id, reason }` et le reste du lot passe. L'app agent envoie ses dates avec `toISOString()` (suffixe `Z`) et affiche les conflits à l'agent, qui peut corriger et renvoyer.

## Options considered

### Option 1: Règle du domaine, format au bord, bornes dans le service, conflit par mouvement en synchro

Une fonction pure `lireDateTerrain` contrôle le format (et refuse `null`), une fonction pure `verifierBornesDateTerrain` contrôle les bornes. Les DTO directs utilisent un schéma Zod partagé qui appelle `lireDateTerrain` (400). Les services appellent `verifierBornesDateTerrain` avec l'heure de `ClockService` et le contrat (422). En synchro, le schéma du push laisse passer la date brute et `SyncService` la lit mouvement par mouvement (conflit).

**Pros**:
- Un seul endroit pour la règle, testé sans base.
- Un mouvement mal daté ne bloque jamais la synchro d'un agent.
- Les bornes dépendent de l'horloge et du contrat, donc elles vivent là où on les connaît.

**Cons**:
- Deux chemins de lecture du format (schéma direct, `SyncService`), même s'ils appellent la même fonction.
- Le schéma du push devient permissif sur ces trois champs : la sûreté repose sur `SyncService`.

### Option 2: Tout dans les schémas Zod

Un schéma Zod strict pour la date terrain dans tous les DTO, y compris le push, avec les bornes dans un `refine`.

**Pros**:
- Le plus simple à écrire et à lire.

**Cons**:
- Un seul mouvement mal daté fait échouer tout le push en 400 : l'agent ne synchronise plus rien.
- Les bornes ont besoin de l'heure courante et du `startDate` du contrat, que le schéma ne connaît pas (ou alors `new Date()` caché dans un schéma, contre la règle du domaine).

### Option 3: Accepter et corriger avec une trace

Accepter toute date, ramener une date aberrante à l'heure de réception, et garder la date déclarée dans une nouvelle colonne signalée dans le rapport.

**Pros**:
- Aucun mouvement refusé, rien ne reste en attente sur le téléphone.

**Cons**:
- Une migration sur les trois tables et un nouveau signal dans le rapport.
- Le mouvement est rangé à un jour que personne n'a choisi ; le rapprochement devient plus dur à expliquer.

## Rationale

L'app agent envoie déjà `toISOString()` et affiche les conflits : exiger un fuseau ne casse rien au déploiement, et refuser une date aberrante est sûr, puisque l'agent voit le mouvement en attente et le renvoie. Refuser garde le rapport simple à expliquer (Option 3 rangerait de l'argent à un jour que personne n'a déclaré) et n'ajoute aucune migration avant le pilote.

L'Option 2 est écartée pour une raison concrète du code : le push valide le lot entier, donc une seule date fautive arrêterait toute la synchro d'un agent, ce qui crée l'écart qu'on veut éviter. Séparer le format (au bord, sans contexte) des bornes (dans le service, avec l'horloge et le contrat) suit la règle du projet : les règles en fonctions pures, `ClockService` comme seule source de l'heure.

Les valeurs viennent du terrain du pilote : 15 minutes couvrent une horloge un peu décalée sans laisser un paiement de 23:30 passer au lendemain ; 30 jours couvrent un agent longtemps hors ligne tout en bloquant une année mal saisie. Le rejeu de l'`id` passe avant tout contrôle, pour qu'une resynchro ne transforme jamais un mouvement accepté en conflit.
