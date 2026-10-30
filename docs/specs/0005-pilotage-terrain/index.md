# 0005. Pilotage terrain : dernière synchro, horloge des téléphones, doublons, courbe

**Date**: 2026-10-30
**Status**: Accepted
**Amends**: [0003](../0003-regles-dates-terrain/index.md) (correction de l'horloge du téléphone en synchro)

## Summary

Quatre manques remontés par l'équipe front après sa première intégration avec l'API en ligne. Le pilotage ne sait pas quand un agent a synchronisé pour la dernière fois. Un téléphone mal réglé (plus de 15 minutes d'avance) voit ses encaissements refusés en conflit alors que l'argent a été collecté. Un agent ne peut pas savoir qu'un numéro de téléphone appartient déjà au membre d'un autre agent. Le superviseur télécharge toute la base pour tracer la courbe des 14 derniers jours. On ajoute une colonne de dernière synchro, une correction d'horloge par lot de synchro, une route de vérification de numéro qui ne révèle pas les fiches des autres agents, et une route d'agrégation par jour du Bénin.

## Requirements

**User stories**:

- En tant que superviseur, je veux voir quand chaque agent a synchronisé pour la dernière fois, pour repérer un téléphone qui ne remonte plus rien.
- En tant qu'agent, je veux que mes encaissements passent même si l'heure de mon téléphone est fausse, pour ne pas perdre d'argent collecté côté serveur.
- En tant qu'agent, je veux savoir avant d'inscrire un membre que son numéro est déjà suivi par un autre agent, sans voir la fiche de ce membre.
- En tant que superviseur, je veux la courbe des encaissements par jour sans télécharger toute la base.

**Acceptance criteria**:

- **AC-1**: `agents.derniere_sync_a` (`timestamptz`, nullable) vaut `ClockService.now()` du dernier `POST /sync/push` ou `GET /sync/pull` de l'agent, mis à jour au début de l'appel (un lot vide compte). `GET /agents` renvoie `derniereSyncA` (`null` : jamais synchronisé).
- **AC-2**: `POST /sync/push` accepte `horlogeClient`, facultatif : l'heure du téléphone au moment de l'envoi, au même format que les dates terrain (ISO 8601 avec fuseau explicite, spec 0003 AC-1). Mal formé, il fait refuser tout le lot en 400 `VALIDATION_ERROR` : c'est une seule valeur, pas un mouvement.
- **AC-3**: L'écart vaut `maintenant − horlogeClient` (ms), avec `maintenant` lu une fois au début du push. Si `|écart| > 15 minutes`, chaque date terrain du lot lue avec succès devient `date + écart` **avant** les bornes du spec 0003, qui restent inchangées (15 min dans le futur, 30 jours dans le passé, pas avant le début du contrat). Le mouvement enregistré garde l'écart en secondes arrondies dans `ecart_horloge_s` (serveur − téléphone : négatif pour un téléphone en avance).
- **AC-4**: Sans `horlogeClient`, ou avec un écart d'au plus 15 minutes (borne incluse), aucune date n'est corrigée et `ecart_horloge_s` reste `null`. Les routes directes (`POST /versements`, `/avances`, `/retraits`) ne corrigent jamais rien.
- **AC-5**: Le rejeu d'un `id` déjà enregistré renvoie le mouvement tel qu'il est en base : ni correction, ni mise à jour de `ecart_horloge_s`.
- **AC-6**: Les lignes du rapport de caisse (`GET /caisse/agents/:id`) portent `ecartHorlogeS` (`null` si la date n'a pas été corrigée).
- **AC-7**: `GET /membres/verifier-telephone?telephone=` cherche le numéro chez **tous** les membres non supprimés, quel que soit le rôle. Le numéro est comparé sur ses seuls chiffres, sans l'indicatif 229 placé devant 8 chiffres : `+229 97 00 00 01`, `22997000001` et `97000001` sont le même numéro. Moins de 8 chiffres : 400.
- **AC-8**: La réponse est `{ existe, membres: [{ id, numeroMembre, nom, prenoms, estAMoi, agent: { nom, numeroAgent } }] }`. Pour un AGENT, `id`, `nom` et `prenoms` valent `null` sur les membres d'un autre agent. SUPERVISEUR et ADMIN reçoivent tout, plus `agent.id`.
- **AC-9**: `GET /dashboard/serie?jours=&agentId=` renvoie `{ du, au, fuseau, agentId, points }`, un point par jour du Bénin des `jours` derniers jours (aujourd'hui compris, 14 par défaut, de 1 à 90, sinon 400), du plus ancien au plus récent : `{ date, encaisse, nbVersements, avances, retraitsNets }`, montants en nombres, à zéro les jours sans mouvement. Chaque mouvement compte au jour du Bénin de sa date terrain, comme le rapport de caisse (spec 0002).
- **AC-10**: Portée de la courbe, comme la caisse : par agent qui a manié l'argent. Un AGENT ne lit que la sienne (`agentId` d'un autre : 404). SUPERVISEUR et ADMIN lisent tous les agents (`agentId: null`) ou un seul (`agentId` inconnu : 404).
- **AC-11**: La migration est additive (une colonne sur `agents`, une sur chacune des trois tables de mouvements), conformément à la règle d'exploitation du guide de mise en ligne.

## Decision

**Chosen option**: une colonne de dernière synchro, une correction d'horloge par lot gardée sur chaque mouvement, une vérification de numéro à visibilité réduite, une agrégation SQL par jour. Raisonnement : [rationale.md](rationale.md).

**Implementation skills**: `nestjs-best-practices` (`.agents/skills/nestjs-best-practices/`) · `prisma-client-api` (`.agents/skills/prisma-client-api/`) · `javascript-typescript-jest` (`.agents/skills/javascript-typescript-jest/`)

## Feature design

**Data model** (migration `20261030180000_pilotage_terrain`) :

| Table                               | Colonne           | Type                | Rôle                              |
| ----------------------------------- | ----------------- | ------------------- | --------------------------------- |
| `agents`                            | `derniere_sync_a` | `timestamptz`, null | dernier push ou pull (AC-1)       |
| `versements`, `avances`, `retraits` | `ecart_horloge_s` | `integer`, null     | écart corrigé, en secondes (AC-3) |

**API surface** :

| Endpoint                             | Method | Key inputs                          | Key outputs                           | Auth               | Key errors                       |
| ------------------------------------ | ------ | ----------------------------------- | ------------------------------------- | ------------------ | -------------------------------- |
| `/api/v1/agents`                     | GET    |                                     | `derniereSyncA` en plus               | SUPERVISEUR, ADMIN | 401, 403                         |
| `/api/v1/sync/push`                  | POST   | `horlogeClient` (opt)               | inchangé                              | bearer             | 400 si `horlogeClient` mal formé |
| `/api/v1/caisse/agents/:agentId`     | GET    |                                     | `lignes[].ecartHorlogeS` en plus      | bearer             | inchangé                         |
| `/api/v1/membres/verifier-telephone` | GET    | `telephone`                         | `{ existe, membres }`                 | bearer             | 400                              |
| `/api/v1/dashboard/serie`            | GET    | `jours` (1–90, 14), `agentId` (opt) | `{ du, au, fuseau, agentId, points }` | bearer             | 400, 404                         |

**Domaine** (pur, testé) :

- `src/domain/date-terrain.ts` : `ecartHorloge(horlogeClient, maintenant): number | null` (null dans la tolérance de 15 min, bornes incluses) et `corrigerDateTerrain(date, ecartMs)`.
- `src/domain/caisse.ts` : `joursDeLaSerie(dernierJour, n)` (les `n` jours du Bénin finissant par `dernierJour`) et `remplirSerie(jours, sommes)` (un point par jour, zéros compris).

**Synchro** : `SyncService.push` lit `maintenant` une fois, note la dernière synchro, calcule l'écart, et le passe à `dateDuMouvement` (correction après une lecture réussie, jamais sur un rejeu) et aux services (`encaisser`, `accorder`, `effectuer`) par un troisième argument `{ ecartHorlogeS }`, que seuls ces appels fournissent. `pull` note aussi la dernière synchro.

**Doublons** : `normaliserTelephone` (`src/modules/membres/membres.service.ts`) et la requête SQL appliquent la même règle (chiffres seuls, `^229(?=[0-9]{8})` retiré). La requête renvoie des `id`, puis Prisma lit les fiches et leur agent ; le masquage se fait dans le service.

**Courbe** : trois `GROUP BY` SQL (versements par `paid_at`, avances par `date_avance`, retraits par `date_retrait`), le jour calculé par `to_char((col AT TIME ZONE 'UTC') + 60 minutes)`, c'est-à-dire le même décalage fixe que `jourBenin`. Les trous sont remplis par `remplirSerie`.

**Value sourcing** :

| Valeur                | Source                                                |
| --------------------- | ----------------------------------------------------- |
| `derniereSyncA`       | `ClockService.now()` au début du push ou du pull      |
| écart d'horloge       | `ClockService.now()` du push − `horlogeClient`        |
| seuil de correction   | `TOLERANCE_FUTUR_MINUTES` (15, spec 0003)             |
| `ecartHorlogeS`       | écart / 1000, arrondi                                 |
| jours de la courbe    | `jourBenin(ClockService.now())` puis `joursDeLaSerie` |
| montants de la courbe | `SUM(amount)`, `SUM(montant)`, `SUM(montant_net)`     |

**Key invariants** :

- Une date terrain corrigée passe ensuite exactement les mêmes bornes qu'une date non corrigée.
- Un AGENT n'obtient jamais l'`id`, le nom ni les prénoms d'un membre d'un autre agent par la vérification de numéro.
- La courbe et le rapport de caisse rangent un mouvement dans le même jour.

**Security model** : routes protégées par le guard JWT global ; portée par rôle dans les services (AC-8, AC-10). La vérification de numéro révèle volontairement à un agent qu'un numéro est suivi, et par qui : c'est le but de la route, limité au numéro de membre et au nom de l'agent.

**Critical test scenarios** (`test/integration/pilotage.int-spec.ts`, `src/domain/*.spec.ts`) :

- Dernière synchro `null`, puis l'heure du pull, puis celle du push, verifies **AC-1**
- Téléphone en avance de 2 h : versement appliqué, `paid_at` ramené à l'heure du serveur, `ecart_horloge_s = -7200` ; la même date sans `horlogeClient` reste un conflit, verifies **AC-2**, **AC-3**, **AC-4**
- Écart de 10 min : rien de corrigé, `ecart_horloge_s` null ; `horlogeClient` mal formé : 400, verifies **AC-2**, **AC-4**
- Numéro `+229 97 00 00 01` trouvé par `97000001` (agent, fiche masquée) et par `22997000001` (superviseur, fiche visible) ; numéro inconnu ; numéro trop court, verifies **AC-7**, **AC-8**
- Courbe de 3 jours avec un versement à 23:30 au Bénin rangé la veille, avance et retrait ; 14 jours par défaut ; 404 et 400 ; superviseur tous ou un seul, verifies **AC-9**, **AC-10**

## Build plan

1. Migration additive et champs Prisma, satisfies **AC-11**
2. Dernière synchro dans `SyncService` et `GET /agents`, satisfies **AC-1**
3. Domaine `ecartHorloge`, `corrigerDateTerrain` ; `horlogeClient` dans le push ; correction et écart gardé par les trois services ; écart dans les lignes de caisse, satisfies **AC-2** à **AC-6**
4. Route de vérification de numéro, satisfies **AC-7**, **AC-8**
5. Domaine `joursDeLaSerie`, `remplirSerie` ; route de courbe, satisfies **AC-9**, **AC-10**
6. Documentation : `docs/integration-front.md`, `src/modules/sync/AGENTS.md`, guide des comptes

## Consequences

**Positive** :

- Un téléphone mal réglé ne fait plus perdre d'encaissements : ils arrivent, à la bonne heure, et la correction reste visible dans la caisse.
- Le pilotage sait qui ne synchronise plus.
- Les doublons entre agents sont détectables sans ouvrir les fiches des autres agents.
- La courbe ne demande plus de télécharger toute la base.

**Negative / tradeoffs** :

- La correction suppose que l'horloge du téléphone n'a pas changé entre le mouvement et l'envoi. Si l'agent remet son téléphone à l'heure entre les deux, les mouvements faits avant sont corrigés à tort ; c'est rare, borné par la règle des 30 jours, et visible grâce à `ecartHorlogeS`.
- L'écart inclut le temps de transit du push (quelques secondes), négligeable devant le seuil de 15 minutes.
- L'app doit envoyer `horlogeClient` : sans lui, le comportement du spec 0003 reste.
- La vérification de numéro dit à un agent qu'un numéro est suivi par un collègue. C'est voulu ; un agent pourrait s'en servir pour sonder des numéros, ce qui reste limité au numéro de membre et au nom de l'agent.
- La comparaison des numéros parcourt la table `membres` (pas d'index sur l'expression) : sans effet à l'échelle du pilote, à revoir au-delà de quelques dizaines de milliers de membres.

**Neutral** :

- Les routes directes gardent les règles du spec 0003 sans correction : elles servent quand le téléphone est en ligne, où l'heure par défaut est celle du serveur.

## Follow-up

- [ ] L'app agent envoie `horlogeClient: new Date().toISOString()` à chaque push.
- [ ] Le back office affiche `derniereSyncA` dans le pilotage et `ecartHorlogeS` dans le détail de caisse.
- [ ] Index d'expression sur le numéro normalisé si la table `membres` grossit (à déclarer hors du schéma Prisma, comme les séquences).
