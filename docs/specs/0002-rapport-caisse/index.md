# 0002. Rapport de caisse par agent et par jour

**Date**: 2026-10-29
**Status**: In Progress

## Summary

On ajoute un rapport de caisse en lecture seule : pour un agent et une journée, ce qu'il a encaissé, ce qu'il a décaissé (avances et retraits), et le solde qu'il doit remettre, avec le détail de chaque reçu. Un superviseur voit aussi tous les agents d'une journée sur un seul écran. Le rapport est calculé à la volée à partir des mouvements déjà en base, sans nouvelle table. C'est la preuve quotidienne du critère de réussite du pilote, zéro écart de caisse. Chaque rapport signale aussi les mouvements reçus ce jour là mais datés d'un jour passé (une synchro tardive), avec leur effet sur les soldes déjà rapprochés, sans changer le solde du jour.

## Requirements

**User stories**:
- En tant que superviseur, je veux voir pour un agent et une date le total encaissé, le total décaissé et le solde attendu, avec le détail des reçus, pour contrôler la remise d'argent du soir.
- En tant que superviseur, je veux voir en un écran tous les agents d'une journée, pour repérer tout de suite un agent silencieux ou un solde anormal.
- En tant qu'agent, je veux voir mon propre rapport du jour, pour savoir combien je dois remettre avant de rentrer.
- En tant que superviseur, je veux savoir si un chiffre a bougé après coup (synchro tardive), pour ne pas prendre une synchro en retard pour un écart.
- En tant que superviseur, je veux voir dans le rapport du jour où elle arrive chaque synchro tardive et son effet sur les jours passés, parce que je ne rouvre pas les jours déjà rapprochés de moi même.

**Acceptance criteria**:
- **AC-1**: `GET /api/v1/caisse/agents/:agentId?date=` renvoie, pour cet agent et cette journée : `encaisse` (somme des `amount` des versements), `avances` (somme des `montant` des avances), `retraitsNets` (somme des `montantNet` des retraits), `decaisse` = `avances` + `retraitsNets`, `soldeAttendu` = `encaisse` − `decaisse`, `nbMouvements` (nombre de lignes, qu'elles aient un reçu ou non), et une ligne par mouvement.
- **AC-2**: Un mouvement est compté pour l'agent qui l'a effectué (`agentId` du mouvement), jamais pour le propriétaire du contrat.
- **AC-3**: Le jour d'un mouvement est sa date terrain (`paidAt`, `dateAvance`, `dateRetrait`) lue à l'heure du Bénin (`Africa/Porto-Novo`, UTC+1 fixe, sans heure d'été) : le jour J couvre `[J 00:00 +01:00, J+1 00:00 +01:00[`. Un versement à 23:30 UTC le jour J−1 compte pour le jour J.
- **AC-4**: Les totaux sont toujours égaux à la somme des lignes renvoyées dans la même réponse, même si une synchro arrive pendant la lecture.
- **AC-5**: Le solde attendu peut être négatif (l'agent a décaissé plus qu'il n'a encaissé) ; `soldeNegatif` vaut alors `true`, sinon `false`.
- **AC-6**: La réponse donne `genereA` (instant du calcul) et `arriveesTardives`, le nombre de mouvements du jour reçus par le serveur après la fin de ce jour au Bénin (`createdAt >= fin`) ; chaque ligne porte aussi `arriveeTardive`. Pour le jour en cours, `fin` est dans le futur, donc `arriveesTardives` vaut toujours 0.
- **AC-7**: Chaque ligne donne : `type` (`VERSEMENT`, `AVANCE`, `RETRAIT`), `id`, `receiptNumber` (peut être `null`), `dateTerrain`, `recuServeurA`, `montant` (l'argent qui entre ou sort de la poche), le membre (`id`, `nom`, `prenoms`, `numeroMembre` et `codeMembre`, chacun pouvant être `null`), `contratId` ; plus `misesCount` sur une ligne de versement seulement, et `typeRetrait` (`PARTIEL` ou `TOTAL`), `montantBrut`, `commissionPrelevee`, `interetDu` sur une ligne de retrait seulement (ces clés sont absentes des autres types). Lignes triées par `dateTerrain` croissante, puis par type (`VERSEMENT`, `AVANCE`, `RETRAIT`), puis par `id` : un ordre entièrement déterministe.
- **AC-8**: `date` est facultative, au format `YYYY-MM-DD` ; absente, c'est aujourd'hui au Bénin (via `ClockService`). Un format invalide, une date qui n'existe pas (`2026-02-30`), une date strictement postérieure à aujourd'hui au Bénin (aujourd'hui est accepté) ou un `agentId` qui n'est pas un uuid donnent 400 `VALIDATION_ERROR`.
- **AC-9**: Un `AGENT` ne lit que son propre rapport ; l'`agentId` d'un autre compte donne 404 `NOT_FOUND`, comme un identifiant inconnu. `SUPERVISEUR` et `ADMIN` lisent le rapport de n'importe quel compte (agent, superviseur, admin, actif ou non, même supprimé logiquement : l'argent a bougé). L'objet `agent` de la réponse donne `actif` et `supprime` (`deletedAt` non nul).
- **AC-10**: `GET /api/v1/caisse?date=` (réservé à `SUPERVISEUR` et `ADMIN`, 403 `FORBIDDEN` pour un `AGENT`) renvoie une ligne par compte : chaque compte `AGENT` actif (`actif` vrai, `deletedAt` nul), même à zéro mouvement, plus tout compte qui a enregistré un mouvement ce jour là (y compris désactivé ou supprimé logiquement). Chaque ligne a les mêmes totaux, `soldeNegatif` et `arriveesTardives` que le rapport détaillé de ce compte. La réponse donne aussi la journée entière avec le même objet `totaux`, plus `soldeNegatif` et `arriveesTardives`. Lignes triées par `agent.nom` (ordre français, `localeCompare('fr')`), puis par `agent.id`.
- **AC-11**: Une migration ajoute les index `(agent_id, paid_at)` sur `versements`, `(agent_id, date_avance)` sur `avances` et `(agent_id, date_retrait)` sur `retraits`.
- **AC-12**: Le rapport n'écrit rien et ne fige rien : il reflète les mouvements présents en base au moment de l'appel.
- **AC-13**: Une réception tardive du jour D est un mouvement de l'agent (`agentId`) reçu par le serveur pendant le jour D au Bénin (`createdAt` dans `[debut, fin[` de D) et dont la date terrain tombe un jour du Bénin avant D (`dateTerrain < debut` de D). Un mouvement reçu le jour même de sa date terrain n'en est jamais une. Le jour de réception est le jour du Bénin de `createdAt`, posé par l'horloge de la base (pas `ClockService`). Pour le jour en cours, la fenêtre s'arrête à maintenant et les chiffres grossissent pendant la journée : c'est attendu, comme pour AC-6. Un mouvement reçu *avant* son jour terrain (possible avec la tolérance de 15 minutes du spec 0003, par exemple daté de D+1 à 00:05 et reçu le jour D à 23:55) n'est pas une réception tardive.
- **AC-14**: Le rapport détaillé donne toujours la clé `receptionsTardives` avec exactement :
  - `nbMouvements` (nombre JSON) et `effetSolde` (somme des `effetSolde` de `parJour`) ;
  - `parJour[]`, un élément par jour terrain touché, trié par `date` croissante, avec exactement les clés `date` (`YYYY-MM-DD`), `nbMouvements` (nombre JSON), `encaisse`, `avances`, `retraitsNets`, `decaisse` et `effetSolde` = `encaisse − decaisse` (chaînes signées comme tous les montants) ; ni `soldeAttendu`, ni `soldeNegatif`, ni `arriveesTardives` ;
  - `lignes[]`, de même forme que les lignes du jour (AC-7), avec `arriveeTardive` (toujours `true` ici) et en plus `jourTerrain` (le jour du Bénin de la date terrain), triées dans l'ordre d'AC-7 (date terrain, type, `id`), donc regroupées par jour.
  `effetSolde` positif veut dire que le solde attendu du jour passé a augmenté (l'agent devait plus ce jour là) ; négatif, qu'il a baissé. Sans réception tardive : `{ "nbMouvements": 0, "effetSolde": "0", "parJour": [], "lignes": [] }`.
- **AC-15**: Les réceptions tardives ne changent ni `totaux`, ni `soldeNegatif`, ni `arriveesTardives`, ni `lignes` du jour D : elles comptent dans le rapport de leur jour terrain, comme tout mouvement (AC-3).
- **AC-16**: La synthèse donne toujours `receptionsTardives { nbMouvements, effetSolde }` pour chaque compte (égal à celui de son rapport détaillé) et pour la journée entière (calculé sur toutes les lignes tardives du jour à plat, donc égal à la somme des comptes). Sans réception tardive : `{ "nbMouvements": 0, "effetSolde": "0" }`. Un compte qui n'a qu'une réception tardive ce jour là (aucun mouvement daté de D) apparaît aussi, avec des `totaux` à zéro, même s'il est désactivé ou supprimé logiquement (comme AC-10), à sa place dans le tri par nom.
- **AC-17**: Cohérence entre les jours : un mouvement daté de J et reçu le jour D (D après J) compte dans `arriveesTardives` du rapport de J et dans `receptionsTardives` du rapport de D, avec le même montant (si aucune synchro n'arrive entre la lecture des deux rapports).
- **AC-18**: Portée : `receptionsTardives` du détail suit la même règle que le détail (un `AGENT` ne voit que les siennes, 404 sinon) ; un `AGENT` n'a pas de synthèse (403, AC-10).

## Decision

**Chosen option**: Option 1: rapport calculé à la volée, totaux tirés des lignes

On calcule le rapport à chaque appel à partir des trois tables de mouvements, lues dans un seul instantané Postgres, et les totaux sont additionnés par une fonction pure du domaine sur les lignes mêmes qui sont renvoyées. Rien n'est stocké.

**Implementation skills**: `nestjs-best-practices` (`kadajett/agent-nestjs-skills`, `.agents/skills/nestjs-best-practices/`) · `prisma-client-api` (`prisma/skills`, `.agents/skills/prisma-client-api/`) · `javascript-typescript-jest` (`github/awesome-copilot`, `.agents/skills/javascript-typescript-jest/`)

## Feature design

**Data model sketch**:
Aucune nouvelle table, aucune nouvelle colonne. Le rapport lit :

| Table (existante) | Champs lus | Filtre | Index ajouté |
|---|---|---|---|
| `versements` | `id`, `agentId`, `contratId`, `amount`, `misesCount`, `paidAt`, `receiptNumber`, `createdAt` | `agentId` + `paidAt` dans le jour | `(agent_id, paid_at)` |
| `avances` | `id`, `agentId`, `contratId`, `montant`, `dateAvance`, `receiptNumber`, `createdAt` | `agentId` + `dateAvance` dans le jour | `(agent_id, date_avance)` |
| `retraits` | `id`, `agentId`, `contratId`, `montantNet`, `montantBrut`, `commissionPrelevee`, `interetDu`, `dateRetrait`, `receiptNumber`, `createdAt` | `agentId` + `dateRetrait` dans le jour | `(agent_id, date_retrait)` |
| `contrats` → `membres` (N:1, puis N:1) | `membre.id`, `nom`, `prenoms`, `numeroMembre` | jointure des lignes | aucun |
| `agents` | `id`, `nom`, `role`, `actif`, `deletedAt` | lignes de la synthèse | aucun |

Les index se déclarent dans `schema.prisma` (`@@index([agentId, paidAt])`, etc.) et passent par `npm run prisma:migrate -- --name index_rapport_caisse`. Un contrat ou un membre supprimé logiquement reste joint : l'argent a bougé, la ligne doit apparaître.

**State transitions**: aucune (lecture seule).

**API surface** (nouveau module `src/modules/caisse/`) :

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/v1/caisse/agents/:agentId` | GET | `agentId`: uuid (req, path), `date`: `YYYY-MM-DD` (opt, query) | `agent { id, nom, role, actif, supprime }`, `date`, `fuseau`, `genereA`, `totaux { encaisse, avances, retraitsNets, decaisse, soldeAttendu, nbMouvements }`, `soldeNegatif`, `arriveesTardives`, `lignes[]`, `receptionsTardives { nbMouvements, effetSolde, parJour[], lignes[] }` | bearer, tout rôle (portée ci dessous) | 400 `VALIDATION_ERROR` (uuid, date invalide ou future), 404 `NOT_FOUND` (inconnu ou hors portée) |
| `/api/v1/caisse` | GET | `date`: `YYYY-MM-DD` (opt, query) | `date`, `fuseau`, `genereA`, `totaux` (journée), `soldeNegatif`, `arriveesTardives`, `receptionsTardives { nbMouvements, effetSolde }`, `agents[] { agent { id, nom, role, actif, supprime }, totaux, soldeNegatif, arriveesTardives, receptionsTardives { nbMouvements, effetSolde } }` triés par `agent.nom` puis `agent.id` | bearer, `@Roles('SUPERVISEUR', 'ADMIN')` | 400 `VALIDATION_ERROR`, 403 `FORBIDDEN` |

Montants en FCFA entiers, sérialisés en chaînes comme partout, signe compris (`"-1500"` pour un solde négatif) ; `nbMouvements` et `arriveesTardives` sont des nombres JSON. Le service convertit une seule fois : `Number(bigint)` en entrant dans le domaine, `BigInt(number)` en sortant. Aucun garde fou n'est requis pour `Number.MAX_SAFE_INTEGER` (environ 9 millions de milliards de FCFA, hors de portée). `fuseau` vaut toujours `"Africa/Porto-Novo"`. `dateTerrain`, `recuServeurA` et `genereA` sont des instants ISO 8601 (UTC). La requête est validée par un schéma Zod (`dto/lire-rapport.dto.ts`) : `date` facultative, regex `^\d{4}-\d{2}-\d{2}$` puis contrôle que la date existe ; la règle « pas dans le futur » dépend de l'horloge et se vérifie dans le service (`BadRequestException`, donc `VALIDATION_ERROR`).

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| les deux routes | jour demandé | query `date`, sinon `jourBenin(clock.now())` |
| les deux routes | bornes du jour `[debut, fin[` | dérivées du jour : `debut` = `Date.UTC(a, m, j) − 1 h`, `fin` = `debut + 24 h` (constante `DECALAGE_BENIN_MINUTES = 60` du domaine) |
| les deux routes | « date future » | jour demandé > `jourBenin(clock.now())` |
| les deux routes | `genereA` | `clock.now()` |
| détail | `encaisse` | somme de `versements.amount` des lignes |
| détail | `avances` | somme de `avances.montant` des lignes |
| détail | `retraitsNets` | somme de `retraits.montantNet` des lignes |
| détail | `decaisse`, `soldeAttendu`, `soldeNegatif` | dérivés : `avances + retraitsNets`, `encaisse − decaisse`, `soldeAttendu < 0` |
| détail | `nbMouvements` | nombre de lignes |
| détail | `arriveeTardive` d'une ligne | `createdAt >= fin` du jour |
| détail | `arriveesTardives` | nombre de lignes avec `arriveeTardive` |
| détail | `montant` d'une ligne | versement `amount` · avance `montant` · retrait `montantNet` |
| détail | `dateTerrain` · `recuServeurA` | `paidAt` / `dateAvance` / `dateRetrait` · `createdAt` |
| détail | membre d'une ligne | `contrat.membre` (`id`, `nom`, `prenoms`, `numeroMembre`, `codeMembre`) |
| détail | `typeRetrait` · `misesCount` | `retraits.type` · `versements.misesCount` |
| détail | `agent` (`supprime` compris) | table `agents` par `agentId` du chemin ; `supprime` = `deletedAt` non nul |
| synthèse | ordre des lignes | `agent.nom` en `localeCompare('fr')`, puis `agent.id` |
| synthèse | comptes listés | `agents` avec `role = AGENT`, `actif`, `deletedAt` nul, union des `agentId` distincts des mouvements du jour |
| synthèse | totaux par compte et de la journée | même fonction du domaine que le détail, sur les lignes du jour groupées par `agentId` |
| les deux routes | mouvements reçus tardivement le jour D | les trois tables, filtre `agentId` (détail) + `createdAt` dans `[debut, fin[` de D + date terrain `< debut` de D |
| les deux routes | jour de réception | `jourBenin(createdAt)`, `createdAt` posé par `now()` de la base |
| détail | `receptionsTardives.parJour[].date` · `lignes[].jourTerrain` | `jourBenin(dateTerrain)` |
| détail | totaux d'un jour de `parJour` | `calculerRapportCaisse` sur les lignes tardives de ce jour ; `effetSolde` = son `soldeAttendu` |
| les deux routes | `receptionsTardives.effetSolde` | somme des `effetSolde` de `parJour` |
| synthèse | `receptionsTardives` de la journée | `regrouperReceptionsTardives` sur toutes les lignes tardives du jour, à plat |
| synthèse | comptes listés | aussi tout `agentId` d'une réception tardive du jour D : trois clauses `some` de plus dans le `OR` du `findMany` des agents (`createdAt` dans `[debut, fin[` et date terrain `< debut`) |

**Domaine** (`src/domain/caisse.ts`, pur, testé) :
- `DECALAGE_BENIN_MINUTES = 60`, `FUSEAU_CAISSE = 'Africa/Porto-Novo'`.
- `jourBenin(instant: Date): string` → `YYYY-MM-DD` du Bénin.
- `bornesJour(jour: string): { debut: Date; fin: Date }` (lève une erreur sur une chaîne invalide ; le DTO l'a déjà filtrée).
- `calculerRapportCaisse(lignes: LigneCaisse[], fin: Date)` → `{ totaux, soldeNegatif, arriveesTardives }`, où `LigneCaisse` = `{ type, montant: number, recuServeurA: Date }`.
- Pas de `setHours` ni de fuseau du serveur : les bornes ne dépendent que de l'arithmétique UTC.
- `regrouperReceptionsTardives(lignes: LigneCaisse[], debutD: Date)` → `{ nbMouvements, effetSolde, parJour: { date, nbMouvements, encaisse, avances, retraitsNets, decaisse, effetSolde }[] }` : garde seulement les lignes dont `dateTerrain < debutD` (AC-13 testable en pur), groupe par `jourBenin(dateTerrain)`, calcule chaque jour avec `calculerRapportCaisse(lignesDuJour, bornesJour(date).fin)` et n'en garde que les totaux (`effetSolde` = son `soldeAttendu`) ; `parJour` trié par `date`.

**Réceptions tardives** : chaque route ajoute trois lectures au même tableau `$transaction` `RepeatableRead` (versements, avances, retraits avec `createdAt` dans le jour D et date terrain avant D ; pour le détail, filtrées sur `agentId` et jointes au membre comme les lignes du jour). Ces lectures filtrent sur `createdAt`, qui n'a aucun index : sans lui, la synthèse parcourrait les trois tables en entier, et le détail tout l'historique de l'agent. On ajoute donc un index `(created_at)` sur `versements`, `avances` et `retraits` (`@@index([createdAt])`, une migration). Les tests à horloge figée posent `createdAt` eux mêmes, puisqu'il vient de la base et non de `ClockService`.

**Lecture** : chaque route lit ses tables dans un seul `prisma.$transaction([...], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })` (forme tableau, un seul instantané). La lecture de l'agent (détail) ou de la liste des agents (synthèse) fait partie du même tableau, aucune lecture avant ; la décision 404 se prend après. AC-4 tient déjà parce que les totaux viennent des lignes ; l'instantané sert à la cohérence entre les tables et à l'égalité entre synthèse et détail. Filtre de date : `>= debut AND < fin`. Les tables de mouvements n'ont pas de `deletedAt` (elles sont en ajout seul) : aucun filtre de suppression sur elles. La synthèse lit tous les mouvements du jour (colonnes minimales, sans jointure membre) puis groupe en mémoire par `agentId` ; au pilote, c'est au plus quelques milliers de lignes.

**Key invariants**:
- `totaux.encaisse − totaux.decaisse = totaux.soldeAttendu`, et chaque total est la somme exacte des lignes de la même réponse.
- Dans la synthèse, les totaux de la journée sont la somme des totaux des comptes, et la ligne d'un compte est identique au rapport détaillé de ce compte pour la même date (même fonction du domaine).
- Un mouvement appartient à exactement un jour et un agent : son `agentId` et sa date terrain dans `[debut, fin[`.
- Commission et intérêt prélevés sur un retrait ne comptent jamais en décaissé (ils restent dans la caisse).
- Les réceptions tardives sont un signal : le solde attendu d'un jour ne dépend que des mouvements datés de ce jour.
- Tout mouvement reçu *après* son jour terrain apparaît une fois dans `arriveesTardives` de son jour terrain et une fois dans `receptionsTardives` de son jour de réception. Un mouvement reçu avant son jour terrain (tolérance de 15 minutes) n'apparaît dans aucun des deux signaux.

**Security model**:
- Route détail : un `AGENT` dont l'`id` diffère de `:agentId` reçoit 404 `NOT_FOUND` (même réponse qu'un identifiant inconnu, on ne confirme pas qu'un compte existe). `SUPERVISEUR` et `ADMIN` lisent tout compte. La limite « un superviseur ne gère que des comptes AGENT » vise la gestion des comptes, pas la lecture des mouvements.
- Route synthèse : `@Roles('SUPERVISEUR', 'ADMIN')`, 403 pour un `AGENT`.
- Les noms des membres sont déjà lisibles par ces rôles ailleurs dans l'API ; aucune donnée nouvelle n'est exposée. Pas de journal d'audit (lecture seule ; le journal des mouvements est la fonction 3).
- Limite de débit : la limite globale existante s'applique.

**Configuration required**: aucune (le fuseau est une constante du domaine, pas une variable d'env).

**Critical test scenarios**:
- Happy path : un agent avec 2 versements, 1 avance et 1 retrait partiel le même jour, la réponse donne les bons totaux, le solde et 4 lignes, verifies **AC-1**, **AC-4**, **AC-7**
- Frontière du jour : un versement à `J−1T23:30Z` compte pour J, un versement à `JT23:30Z` compte pour J+1, verifies **AC-3**
- Attribution : un superviseur encaisse sur le contrat d'un agent, le mouvement apparaît dans le rapport du superviseur et pas dans celui de l'agent, verifies **AC-2**
- Solde négatif : un retrait sans encaissement le même jour donne un solde négatif et `soldeNegatif: true`, verifies **AC-5**
- Synchro tardive : un versement daté J avec `createdAt` à J+1 est compté et signalé, `arriveesTardives` vaut 1, verifies **AC-6**
- Dates refusées : `2026-02-30`, `29-10-2026` et demain au Bénin donnent 400, verifies **AC-8**
- Portée : un `AGENT` sur le rapport d'un autre reçoit 404, sur la synthèse reçoit 403, verifies **AC-9**, **AC-10**
- Synthèse : un agent actif sans mouvement apparaît à zéro, un compte désactivé qui a encaissé apparaît, et les totaux de chaque compte égalent ceux de son rapport détaillé, verifies **AC-10**
- Membre supprimé : un versement sur le contrat d'un membre supprimé logiquement reste dans le rapport, avec son membre, verifies **AC-7**, **AC-12**
- Réceptions tardives : un versement daté J−2 et une avance datée J−1, reçus le jour J, apparaissent dans `receptionsTardives` du jour J (deux éléments dans `parJour`, effet net juste) sans changer ses totaux, et dans `arriveesTardives` de J−2 et J−1, verifies **AC-13**, **AC-14**, **AC-15**, **AC-17**
- Synthèse : un agent désactivé dont le seul mouvement reçu le jour J est daté de la veille apparaît avec `nbMouvements` 0 et une réception tardive, égale à son détail ; le total de la journée égale la somme des comptes, verifies **AC-16**
- Cas vide et sens : un rapport sans réception tardive renvoie la clé vide d'AC-14 ; un retrait reçu en retard donne un `effetSolde` négatif, verifies **AC-14**
- Réception précoce : un versement daté de J+1 00:05 et reçu le jour J à 23:55 n'apparaît dans aucun signal, verifies **AC-13**

## Build plan

Ordre Tracer Bullet : un fil fin de bout en bout (domaine, route détail, test d'intégration) d'abord, puis on épaissit.

1. Domaine `src/domain/caisse.ts` + `caisse.spec.ts` : `jourBenin`, `bornesJour` (frontières 23:00 UTC, fin de mois, année bissextile), `calculerRapportCaisse` (totaux, solde négatif, arrivées tardives), satisfies **AC-1**, **AC-3**, **AC-5**, **AC-6**
2. Fil détail de bout en bout : module `caisse` (controller, service, module enregistré dans `AppModule`), DTO de requête Zod, route `GET /caisse/agents/:agentId` lisant les trois tables dans une transaction `RepeatableRead`, lignes triées, totaux tirés du domaine ; test d'intégration `test/integration/caisse.int-spec.ts` sur le happy path, satisfies **AC-1**, **AC-2**, **AC-4**, **AC-7**, **AC-12**
3. Règles du détail : date par défaut via `ClockService`, date invalide ou future en 400, portée `AGENT` en 404 ; tests d'intégration frontière du jour, attribution, solde négatif, synchro tardive, dates refusées, portée, satisfies **AC-2**, **AC-3**, **AC-5**, **AC-6**, **AC-8**, **AC-9**
4. Route synthèse `GET /caisse` : comptes listés (actifs + ceux qui ont bougé), groupement par agent avec la même fonction du domaine, totaux de la journée, `@Roles` ; tests d'intégration (agent à zéro, compte désactivé, égalité avec le détail, 403), satisfies **AC-10**, **AC-4**
5. Migration des trois index (`npm run prisma:migrate -- --name index_rapport_caisse`), appliquée et vérifiée en base (`\d versements` montre l'index), satisfies **AC-11**
6. Domaine : `regrouperReceptionsTardives(lignes, debutD)` + tests (filtre avant D, regroupement par jour terrain, tri, effet négatif, frontière du jour du Bénin, cas vide), satisfies **AC-13**, **AC-14**
7. Réceptions tardives dans les deux routes : trois lectures de plus dans l'instantané, `receptionsTardives` dans le détail et la synthèse, comptes listés étendus ; clauses `some` de la synthèse ; tests d'intégration avec `createdAt` posé à la main (détail, synthèse, cas vide, réception précoce, portée, cohérence J et D), satisfies **AC-13** à **AC-18**
8. Migration `index_reception_mouvements` : `@@index([createdAt])` sur les trois tables, appliquée et vérifiée en base, satisfies **AC-16**

## Consequences

**Positive**:
- Le superviseur a chaque soir un chiffre à comparer à l'argent remis, par agent et pour toute l'équipe.
- Aucun état stocké, donc rien à resynchroniser ni à corriger : corriger un mouvement corrige le rapport.
- Le fuseau fixe rend le rapport identique quel que soit le serveur, et testable sans dépendre de la machine.

**Negative / tradeoffs**:
- Le rapport d'un jour passé peut changer quand un téléphone synchronise tard ; c'est voulu (date terrain), mais il faut lire `arriveesTardives` pour ne pas y voir un écart. Le rapport du jour de réception le signale aussi (`receptionsTardives`), mais rouvrir le jour passé reste une action du superviseur.
- Chaque rapport fait trois lectures de plus, et la synthèse trois sous requêtes `some` de plus ; avec l'index `(created_at)`, négligeable au pilote. Une migration de plus à déployer.
- Le rapport ne prouve pas encore que l'argent a été remis : la remise et son écart ne sont pas enregistrés (fonction suivante).
- Pas de pagination : une journée hors norme (des milliers de reçus pour un agent) renverrait une grosse réponse.
- Si le Bénin changeait un jour de fuseau ou d'heure d'été, la constante serait à revoir.
- Une migration de plus (trois index) à déployer avant la route. Ces index servent surtout le détail ; la synthèse (tous les agents d'un jour) en profite peu, ce qui ne compte pas au volume du pilote.
- La date terrain vient du téléphone : un téléphone mal réglé peut ranger un mouvement le mauvais jour, sans signal dans le rapport.

**Neutral**:
- Les heures (`dateTerrain`, `genereA`) restent en UTC dans le JSON ; c'est au client de les afficher en heure du Bénin.
- Le code existant qui calcule « aujourd'hui » avec l'heure du serveur (`debutDeJour`) n'est pas touché par ce spec.

## Follow-up

- [ ] Enregistrer la remise du soir (argent reçu par le superviseur, écart avec le solde attendu, qui l'a reçue) : à proposer au scope comme nouvelle fonction après celle ci, elle passera par le journal d'audit (fonction 3).
- [ ] Le reste du code calcule « aujourd'hui » avec l'heure du serveur (UTC en conteneur), par exemple le statut de collecte du tableau de bord : envisager de réutiliser `jourBenin` partout, via un spec transverse.
- [ ] Signaler un mouvement dont la date terrain s'écarte trop de sa réception serveur (`paidAt` après `createdAt`, ou très en avance), pour repérer un téléphone mal réglé.
- [ ] Les avances n'ont toujours pas le verrou de contrat ajouté au retrait et à l'encaissement (fonction 9) ; un écart peut encore naître d'une avance et d'un retrait simultanés.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
