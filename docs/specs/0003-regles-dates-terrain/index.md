# 0003. Règles des dates terrain des mouvements

**Date**: 2026-10-29
**Status**: Accepted, amended by [0005](../0005-pilotage-terrain/index.md) (correction de l'horloge du téléphone en synchro)

## Summary

Les dates terrain d'un versement, d'une avance ou d'un retrait (le moment où l'argent a changé de mains) décident du jour où il compte dans le rapport de caisse. Aujourd'hui l'API en accepte n'importe laquelle : une date `null` devient le 1er janvier 1970, une date sans fuseau dépend de l'heure du serveur, une date future rend le mouvement invisible. On fixe une règle unique : format ISO avec fuseau explicite, pas plus de 15 minutes dans le futur, pas plus de 30 jours dans le passé, pas avant le début du contrat. En synchro, un mouvement mal daté devient un conflit sans bloquer le reste du lot.

## Requirements

**User stories**:
- En tant que superviseur, je veux que chaque mouvement compte dans le bon jour, pour que le solde du soir corresponde à l'argent remis.
- En tant qu'agent, je veux qu'un mouvement mal daté me soit signalé comme conflit, sans bloquer le reste de ma synchro, pour le corriger et le renvoyer.
- En tant que développeur, je veux une seule règle de date pour les trois mouvements, testée dans le domaine, pour ne pas la réécrire trois fois.

**Acceptance criteria**:
- **AC-1**: Sur les routes directes (`POST /versements`, `/avances`, `/retraits`), `paidAt`, `dateAvance` et `dateRetrait` sont facultatives ; présentes, elles doivent être une chaîne ISO 8601 avec heure et fuseau explicite désignant un instant qui existe, sinon 400 `VALIDATION_ERROR` sans rien écrire. Cas tranchés :
  - acceptés : `2026-10-29T22:30:00Z`, `2026-10-29T22:30:00.123Z`, de 1 à 9 chiffres après la virgule (`.123456789`, tronqués à la milliseconde), secondes absentes (`2026-10-29T22:30Z`), décalage `+01:00`, `+00:00` ;
  - refusés (400) : `null`, un nombre, une date seule (`2026-10-29`), une chaîne sans fuseau (`2026-10-29T23:30:00`), un `z` minuscule, le décalage `-00:00`, une date impossible (`2026-02-30T10:00:00Z`, `T24:00:00Z`, `T23:59:60Z`, décalage `+99:00` ou au delà de `±14:00`) ;
  - l'année `0000` passe le format mais est refusée par les bornes (422, AC-4).
- **AC-2**: Sur les routes directes, une date terrain absente vaut l'heure du serveur, lue via `ClockService.now()`.
- **AC-3**: Une date terrain postérieure à `maintenant + 15 minutes` est refusée : 422 `BUSINESS_RULE` en direct, conflit en synchro. Exactement `maintenant + 15 minutes` est accepté (borne incluse, comparée en millisecondes).
- **AC-4**: Une date terrain antérieure à `maintenant − 30 jours` (30 × 86 400 000 ms) est refusée de la même façon. Exactement `maintenant − 30 jours` est accepté.
- **AC-5**: Une date terrain dont le jour du Bénin (`jourBenin`, spec 0002) est avant le `startDate` du contrat est refusée de la même façon. C'est voulu aussi pour la date par défaut : sur un contrat qui commence demain, un versement sans date est refusé.
- **AC-6**: En synchro (`POST /sync/push`), chaque versement, avance et retrait est contrôlé un par un : une date absente, `null`, mal formée ou hors bornes donne un conflit `{ entity, id, reason }` dont la raison est l'un des messages ci dessous, et les autres mouvements du lot sont appliqués. Le push ne renvoie jamais 400 à cause d'une date de mouvement (un autre champ invalide, comme `misesCount`, fait toujours échouer le lot : hors du périmètre de ce spec).
- **AC-7**: En synchro, une date terrain absente est un conflit (« Date terrain manquante. ») : un mouvement fait hors ligne n'est jamais daté du moment de la synchro.
- **AC-8**: Un mouvement dont l'`id` existe déjà est rejoué comme avant, sans contrôle de bornes : une resynchro d'un mouvement accepté il y a plus de 30 jours renvoie toujours le mouvement enregistré. En synchro, c'est vrai même si la date renvoyée est absente ou mal formée (anciens lots sans `paidAt`) : `SyncService` cherche l'`id` avant de déclarer un conflit de format. En direct, le format reste contrôlé au bord (un rejeu avec `paidAt: null` reçoit 400).
- **AC-11**: Les raisons de refus sont exactement :
  - « Date terrain manquante. » (synchro seulement) ;
  - « Date terrain invalide : format ISO 8601 avec fuseau attendu (ex. 2026-10-29T22:30:00Z). » ;
  - « Date terrain dans le futur : au plus 15 minutes après l'heure du serveur. » ;
  - « Date terrain trop ancienne : au plus 30 jours avant l'heure du serveur. » ;
  - « Date terrain avant le début du contrat (AAAA-MM-JJ). », avec le `startDate` du contrat à la place de `AAAA-MM-JJ`.
- **AC-9**: Une date acceptée garde son instant exact : `2026-10-29T23:30:00+01:00` est enregistrée `2026-10-29T22:30:00Z` et compte pour le 29 au Bénin.
- **AC-10**: La règle vit dans une seule fonction pure du domaine, testée, appliquée de la même façon aux trois types de mouvement.

## Decision

**Chosen option**: Option 1: règle du domaine, format au bord, bornes dans le service, conflit par mouvement en synchro

Les trois dates de mouvement suivent une règle unique du domaine ; une date mal formée est refusée au bord (400 en direct, conflit en synchro), une date hors bornes est refusée par le service (422 en direct, conflit en synchro).

**Implementation skills**: `nestjs-best-practices` (`kadajett/agent-nestjs-skills`, `.agents/skills/nestjs-best-practices/`) · `javascript-typescript-jest` (`github/awesome-copilot`, `.agents/skills/javascript-typescript-jest/`)

## Feature design

**Data model sketch**: aucune table, aucune colonne, aucune migration. Les colonnes `versements.paid_at`, `avances.date_avance`, `retraits.date_retrait` (`timestamptz`) et `contrats.start_date` (`date`) sont lues telles quelles.

**API surface** (contrats modifiés, aucune nouvelle route) :

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/v1/versements` | POST | `paidAt`: chaîne ISO avec fuseau (opt) | inchangé | bearer | 400 `VALIDATION_ERROR` (format, `null`), 422 `BUSINESS_RULE` (bornes) |
| `/api/v1/avances` | POST | `dateAvance`: chaîne ISO avec fuseau (opt) | inchangé | bearer | 400, 422 comme ci dessus |
| `/api/v1/retraits` | POST | `dateRetrait`: chaîne ISO avec fuseau (opt) | inchangé | bearer | 400, 422 comme ci dessus |
| `/api/v1/sync/push` | POST | `versements[].paidAt`, `avances[].dateAvance`, `retraits[].dateRetrait` : chaîne ISO avec fuseau (req) | `applied`, `conflicts[]` (un conflit par mouvement mal daté) | bearer | jamais 400 pour une date de mouvement |

**Domaine** (`src/domain/date-terrain.ts`, pur, testé) :
- `TOLERANCE_FUTUR_MINUTES = 15`, `ANCIENNETE_MAX_JOURS = 30`.
- `FORMAT_DATE_TERRAIN` : `^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|([+-])(\d{2}):(\d{2}))$`.
- `lireDateTerrain(valeur: unknown): { ok: true; date: Date } | { ok: false; raison: string }` : refuse `undefined` (« Date terrain manquante. »), puis avec le message « invalide » : `null`, une valeur qui n'est pas une chaîne, une chaîne hors format, `-00:00`, et une date impossible. Le contrôle se fait sur les morceaux capturés par la regex, jamais en relisant un `Date` (un décalage `+01:00` changerait les champs relus) : mois de 1 à 12, jour de 1 au nombre de jours du mois (années bissextiles comprises), heure de 0 à 23, minutes et secondes de 0 à 59, décalage d'au plus 14 heures et minutes de 0 à 59. L'instant est calculé avec `Date.UTC(...)` moins le décalage, la fraction tronquée à la milliseconde.
- `verifierBornesDateTerrain(date: Date, maintenant: Date, debutContrat: Date): { ok: true } | { ok: false; raison: string }` : trop dans le futur, trop ancienne, avant le début du contrat (comparaison `jourBenin(date) < debutContrat.toISOString().slice(0, 10)`).

**Bord direct** : un schéma Zod partagé `dateTerrainSchema` (`src/common/schemas/date-terrain.schema.ts`) applique `lireDateTerrain` et renvoie un `Date` ; les trois DTO directs l'utilisent en `.optional()` (donc `null` refusé). Une erreur donne 400 via `ZodValidationPipe`.

**Bord synchro** : dans `push.dto.ts`, les trois champs deviennent `z.unknown()`. Pour chaque mouvement, `SyncService` appelle `lireDateTerrain` :
- si la lecture réussit, il appelle le service avec `{ ...v, paidAt: lu.date }` (de même `dateAvance`, `dateRetrait`) ; les services gardent leurs DTO typés `Date | undefined` ;
- si elle échoue, il cherche l'`idempotencyKey` (`findUnique`) : un mouvement existant est ajouté à `applied` comme un rejeu, sinon un conflit est ajouté avec la raison de `lireDateTerrain`, et on passe au mouvement suivant.
Ordre en synchro : format, puis rejeu, puis (dans le service) contrat introuvable ou non actif, puis bornes. Une raison de 422 remonte dans le conflit par la fonction `raison` existante.

**Services** (`CollecteService`, `AvancesService`, `RetraitsService`) : `ClockService` injecté. Ordre dans la transaction : verrou, puis `maintenant = clock.now()` (lu une seule fois, après l'attente du verrou), rejeu de l'`id`, contrat et statut, puis `verifierBornesDateTerrain(date ?? maintenant, maintenant, contrat.startDate)`, puis les règles métier existantes. La date par défaut devient `maintenant` (au lieu de `new Date()`).

**Harnais de test** : `creerAppDeTest({ horloge })` remplace `ClockService` par une horloge fixe (`overrideProvider(ClockService).useValue({ now: () => horloge })`), pour tester les bornes exactes sans dépendre du temps qui passe. Les contrats des fabriques sont alors datés par rapport à cette horloge.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| écriture directe | date terrain par défaut | `ClockService.now()` |
| écriture directe et synchro | `maintenant` des bornes | `ClockService.now()`, lu une fois par écriture |
| écriture directe et synchro | tolérance future | constante `TOLERANCE_FUTUR_MINUTES` (15) |
| écriture directe et synchro | ancienneté maximale | constante `ANCIENNETE_MAX_JOURS` (30) |
| écriture directe et synchro | début du contrat | `contrats.start_date` |
| écriture directe et synchro | jour du Bénin de la date | `jourBenin` (spec 0002) |
| synchro | `reason` d'un conflit de date | messages fixés par AC-11, renvoyés par `lireDateTerrain` ou `verifierBornesDateTerrain` (message du 422 en direct) |
| synchro | rejeu d'un mouvement à la date illisible | `idempotencyKey` cherché en base par `SyncService` |

**Key invariants**:
- Toute date terrain enregistrée vérifie : `maintenant − 30 j <= date <= maintenant + 15 min` au moment de l'écriture, et `jourBenin(date) >= startDate` du contrat.
- Aucune date terrain enregistrée ne dépend du fuseau du serveur.
- Le rejeu d'un `id` existant passe avant tout contrôle de bornes ; en synchro, il passe aussi avant le contrôle de format.
- Une date de mouvement ne fait jamais échouer un push entier.

**Security model**: inchangé (portée par rôle des services existants). La règle ne fait que refuser des entrées ; elle n'expose aucune donnée.

**Critical test scenarios**:
- Happy path : un versement daté `2026-10-29T23:30:00+01:00` (dans les bornes) est enregistré à `22:30Z` et compte pour le 29, verifies **AC-9**
- Format (par HTTP) : `null`, `1730000000000`, `2026-10-29`, `2026-10-29T23:30:00`, `T24:00:00Z`, `+99:00` donnent 400 sans écriture, verifies **AC-1**
- Bornes (horloge fixe) : `maintenant + 15 min + 1 ms`, `maintenant − 30 j − 1 ms`, la veille du `startDate` donnent 422 avec le message d'AC-11 ; `maintenant + 15 min` et `maintenant − 30 j` passent, verifies **AC-3**, **AC-4**, **AC-5**, **AC-11**
- Synchro : un lot avec un versement valide, un versement daté `null`, un retrait sans date et une avance future applique le premier et renvoie trois conflits, en 200, verifies **AC-6**, **AC-7**, **AC-11**
- Rejeu : un versement accepté puis renvoyé en synchro avec le même `id` et sans date est rejoué, sans conflit, verifies **AC-8**

## Build plan

Ordre Tracer Bullet : la règle du domaine, puis un fil complet sur le versement, puis les deux autres mouvements, puis la synchro.

1. Domaine `src/domain/date-terrain.ts` + `date-terrain.spec.ts` : format (tous les cas d'AC-1), bornes exactes à 15 min et 30 j, début du contrat au jour du Bénin, messages d'AC-11, satisfies **AC-1**, **AC-3**, **AC-4**, **AC-5**, **AC-10**, **AC-11**
2. Harnais : option `horloge` de `creerAppDeTest` (remplace `ClockService`), satisfies **AC-3**, **AC-4**
3. Fil versement de bout en bout : `dateTerrainSchema` partagé, `encaisser.dto.ts`, `ClockService` et bornes dans `CollecteService` (après le rejeu), tests d'intégration format, bornes, défaut, fuseau `+01:00`, rejeu, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-8**, **AC-9**, **AC-11**
4. Avances et retraits : mêmes changements dans `accorder-avance.dto.ts`, `effectuer-retrait.dto.ts`, `AvancesService`, `RetraitsService`, avec leurs tests d'intégration, satisfies **AC-1** à **AC-5**, **AC-8**
5. Synchro : champs bruts dans `push.dto.ts`, lecture par mouvement dans `SyncService` (rejeu sur échec de lecture, date manquante, mal formée, hors bornes → conflit), test d'intégration d'un lot mixte et d'un rejeu sans date, satisfies **AC-6**, **AC-7**, **AC-8**, **AC-11**
6. `scripts/smoke.mjs` : ajouter `paidAt: new Date().toISOString()` au versement poussé (sinon « 0 conflit » échoue), satisfies **AC-7**

## Consequences

**Positive**:
- Plus aucun mouvement rangé en 1970, dans le futur, ou à un jour qui dépend du serveur : le rapport de caisse voit tout l'argent.
- Un mouvement mal daté est visible (conflit) au lieu d'être silencieux, et ne bloque jamais une synchro.
- La règle est écrite une fois, dans le domaine.

**Negative / tradeoffs**:
- Un mouvement refusé reste en attente sur le téléphone tant que l'agent ne corrige pas l'heure et ne renvoie pas : l'argent n'est pas en base pendant ce temps. C'est sûr seulement parce que l'app affiche les conflits.
- Un agent hors ligne plus de 30 jours voit ses mouvements refusés ; il faudra une procédure manuelle (rare au pilote).
- Le schéma du push devient permissif sur trois champs : la sûreté dépend de `SyncService`, et un oubli là serait silencieux (d'où le test du lot mixte).
- Un client qui envoyait `null` ou une date sans fuseau sera refusé après le déploiement (l'app actuelle n'est pas concernée).
- `startDate` reste en `z.coerce.date()` : une heure envoyée par l'app (minuit au Bénin, soit `T23:00Z` la veille) est stockée un jour trop tôt, ce qui rend AC-5 un peu plus tolérant. Limite connue jusqu'au spec de suivi sur les autres dates.

**Neutral**:
- Pas de migration : un seul déploiement, retour arrière par simple revert.
- Les dates hors mouvement (`dateSouscription`, `startDate`, `dateNaissance`, `updatedAt` du push) gardent leur comportement actuel.

## Follow-up

- [ ] Vérifier en production, avant le pilote, qu'aucun mouvement existant n'a une date terrain en 1970, dans le futur ou très ancienne (une requête de lecture sur les trois tables) ; en corriger les éventuels à la main.
- [ ] Appliquer une règle de format au reste des dates écrites (`dateSouscription`, `startDate`, `updatedAt`), qui ont aussi `z.coerce.date()`, via un spec dédié.
- [ ] Décrire une procédure pour un agent revenu après plus de 30 jours hors ligne.

## Rationale

Raisonnement et options : voir [rationale.md](rationale.md).
