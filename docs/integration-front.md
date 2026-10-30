# Intégration front : API Agbajowo

Ce document décrit tout ce dont le back office web (et l'app agent) a besoin pour parler à l'API : authentification, formats, routes, erreurs. Il est écrit à partir du code ; en cas de doute, le code et la doc Swagger locale (`http://localhost:3001/api/v1/docs`, voir plus bas) font foi.

## 1. Bases

|                         |                                                                                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **URL de base (prod)**  | `https://agbajowo-api.onrender.com/api/v1`                                                                                                                                              |
| **URL de base (local)** | `http://localhost:3001/api/v1`                                                                                                                                                          |
| **Format**              | JSON (`Content-Type: application/json`), sauf l'envoi de photo (multipart)                                                                                                              |
| **Authentification**    | `Authorization: Bearer <accessToken>` sur toutes les routes, sauf `POST /auth/login`, `POST /auth/refresh` et `GET /health`                                                             |
| **CORS (prod)**         | une seule origine autorisée, réglée dans Render (`CORS_ORIGIN`), aujourd'hui `https://agbajowo.vercel.app` (les URLs d'aperçu Vercel sont refusées). En local : `http://localhost:3000` |
| **Limite de débit**     | 100 requêtes par minute et par client ; `POST /auth/login` : 10 par minute. Au delà : **429**                                                                                           |
| **Swagger**             | éteint en prod. En local, avec `SWAGGER_ENABLED=true` : `/api/v1/docs` (interface) et `/api/v1/docs-json` (OpenAPI brut, pour générer un client typé)                                   |

**Réveil** : le service gratuit de Render s'endort après 15 minutes sans requête. Le premier appel après un sommeil peut prendre 30 à 60 secondes : prévoir un délai d'attente long et un indicateur de chargement, sans afficher d'erreur trop vite.

## 2. Conventions de données

- **Identifiants** : UUID. Pour les créations, le client peut fournir son propre `id` (UUID v4) : c'est la clé d'idempotence (voir §5).
- **Montants (FCFA, entiers)** : attention, deux formes selon la route.
  - Dans les **entités brutes** (versement, avance, retrait, contrat dans une liste, rapport de caisse), les montants sont des **chaînes** : `"1500"`, `"-1000"`. Convertir avec `Number(...)` pour l'affichage ; ils restent sous `Number.MAX_SAFE_INTEGER`.
  - Dans les **valeurs calculées** (`GET /contrats/:id` : `miseAmount` et tout `derive` ; `GET /contrats/:id/releve` ; `GET /dashboard/*`), ce sont des **nombres**.
  - `serverSeq` est toujours une **chaîne**.
- **En entrée**, envoyer les montants en nombres entiers (`"montant": 10000`) ; une chaîne numérique est aussi acceptée.
- **Instants** : ISO 8601 en UTC (`2026-10-29T10:00:00.000Z`).
- **Jours de rapport** (`date` des routes de caisse) : `YYYY-MM-DD`, jour du Bénin (UTC+1).
- **Dates terrain** (`paidAt`, `dateAvance`, `dateRetrait`) : ISO 8601 **avec fuseau explicite** (`2026-10-29T22:30:00Z` ou `2026-10-29T23:30:00+01:00`), au plus 15 minutes dans le futur, au plus 30 jours dans le passé, pas avant le début du contrat. Absente : l'heure du serveur. `null` est refusé (400).
- **Champs facultatifs** : `null` ou absent.

## 3. Erreurs

Toutes les erreurs ont la même forme :

```json
{
  "code": "BUSINESS_RULE",
  "message": "Dépasse l'objectif du livret (372 mises).",
  "details": {},
  "requestId": "43c746ec-7a91-43eb-895a-7a5bed7abb76"
}
```

| Statut | `code`             | Quand                                                                                                          | Que faire côté front                            |
| ------ | ------------------ | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 400    | `VALIDATION_ERROR` | Corps ou paramètre invalide. `details` = `{ formErrors: string[], fieldErrors: { champ: string[] } }`          | Afficher `fieldErrors` sous les champs          |
| 401    | `UNAUTHENTICATED`  | Pas de jeton, jeton expiré, identifiants faux                                                                  | Tenter un refresh (§4), sinon renvoyer au login |
| 403    | `FORBIDDEN`        | Rôle insuffisant                                                                                               | Masquer l'action pour ce rôle                   |
| 404    | `NOT_FOUND`        | Ressource absente **ou hors de la portée du rôle** (un AGENT qui lit le membre d'un autre reçoit 404, pas 403) |                                                 |
| 409    | `CONFLICT`         | Doublon (téléphone d'agent, `codeMembre`…)                                                                     |                                                 |
| 422    | `BUSINESS_RULE`    | Règle métier violée ; `message` est lisible par l'utilisateur                                                  | Afficher `message` tel quel                     |
| 429    | `RATE_LIMITED`     | Trop de requêtes                                                                                               | Attendre une minute                             |
| 500    | `INTERNAL`         | Erreur serveur                                                                                                 | Afficher le `requestId` pour le support         |

Chaque réponse porte aussi l'en-tête `X-Request-Id`. On peut en envoyer un (UUID) pour corréler ses propres logs.

## 4. Authentification

### Connexion

`POST /auth/login` (public)

```json
{ "telephone": "22997000001", "password": "..." }
```

Réponse **200** :

```json
{
  "accessToken": "eyJ...",
  "accessExpiresIn": 900,
  "refreshToken": "eyJ...",
  "refreshExpiresIn": 2592000,
  "agent": {
    "id": "9d507c51-861f-48d7-bed8-d83d1cefd04e",
    "nom": "Agent Terrain",
    "telephone": "22997000001",
    "role": "AGENT",
    "numeroAgent": 3,
    "mustChangePassword": false
  }
}
```

- `accessToken` vit **15 minutes** (`accessExpiresIn` en secondes), `refreshToken` **30 jours**.
- **Si `agent.mustChangePassword` est vrai**, envoyer l'utilisateur sur l'écran de changement de mot de passe avant tout le reste (compte neuf ou réinitialisé).
- Erreurs : 401 (identifiants faux ou compte désactivé, même message), 429 (10 essais par minute).

### Renouveler les jetons

`POST /auth/refresh` (public) avec `{ "refreshToken": "..." }` : même réponse que le login.

Le jeton de rafraîchissement est **à usage unique** (rotation) : remplacer les deux jetons stockés à chaque appel. Si deux requêtes partent en 401 en même temps, ne faire **qu'un seul** refresh et mettre les autres en attente, sinon la seconde utilise un jeton déjà consommé et reçoit 401.

### Autres routes

| Route                        | Corps                                                                                                  | Réponse                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `GET /auth/me`               |                                                                                                        | `{ id, nom, telephone, role, numeroAgent, mustChangePassword }` |
| `POST /auth/change-password` | `{ "currentPassword": "...", "newPassword": "..." }` (au moins 8 caractères, une lettre et un chiffre) | **200**, nouveaux jetons (même forme que le login)              |
| `POST /auth/logout`          | `{ "refreshToken": "..." }`                                                                            | **204**, le jeton est révoqué                                   |

Désactiver un compte ou réinitialiser son mot de passe coupe ses sessions : son prochain refresh répond 401.

## 5. Rôles et idempotence

- **`AGENT`** : ne voit et ne modifie que ses données (ses membres, leurs contrats, ses mouvements, son rapport de caisse).
- **`SUPERVISEUR`** : voit tout ; ne gère que des comptes `AGENT`.
- **`ADMIN`** : voit tout et gère tous les comptes.

Toutes les routes métier sont ouvertes aux trois rôles, sauf `/agents` et `GET /caisse` (SUPERVISEUR et ADMIN).

**Idempotence** : `POST /membres`, `/contrats`, `/versements`, `/avances`, `/retraits` et `/media` acceptent un `id` client. Générer l'UUID **avant** l'envoi et le réutiliser en cas de nouvelle tentative (coupure réseau, délai dépassé) : le serveur renvoie l'enregistrement existant au lieu d'en créer un second. C'est indispensable pour les mouvements d'argent.

## 6. Routes

### Santé

`GET /health` (public) → **200** `{ "status": "ok", "service": "agbajowo-api", "database": "ok", "timestamp": "...", "uptime": 14 }`, ou **503** avec `"database": "injoignable"`.

### Comptes agents (SUPERVISEUR, ADMIN)

| Route               | Corps / paramètres                                                                                                                              | Réponse                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /agents`       |                                                                                                                                                 | Liste de comptes `{ id, nom, telephone, role, numeroAgent, actif, mustChangePassword, createdAt }`. Un SUPERVISEUR ne voit que les `AGENT` |
| `POST /agents`      | `{ "nom": "...", "telephone": "...", "role": "AGENT" }` (`role` : `AGENT` par défaut ; un SUPERVISEUR ne peut créer que des `AGENT`, sinon 403) | **201** `{ agent, motDePasseTemporaire }`                                                                                                  |
| `PATCH /agents/:id` | au moins un de `{ "actif": false, "role": "SUPERVISEUR", "reinitialiserMotDePasse": true }`                                                     | **200** `{ agent, motDePasseTemporaire }` (`motDePasseTemporaire` seulement si réinitialisé)                                               |

Le mot de passe temporaire n'est renvoyé **qu'une seule fois** : l'afficher clairement pour qu'il soit noté. Personne ne peut modifier son propre compte. Erreurs : 409 si le téléphone est déjà pris.

### Membres

| Route                            | Corps / paramètres                                                                            | Réponse                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `POST /membres`                  | voir ci-dessous                                                                               | **201**, le membre                                                 |
| `GET /membres?q=&limit=&cursor=` | `q` cherche dans nom, prénoms, numéro, code et téléphone ; `limit` de 1 à 200 (50 par défaut) | `{ data: Membre[], nextCursor: string \| null, hasMore: boolean }` |
| `GET /membres/:id`               |                                                                                               | Le membre avec `contrats: Contrat[]`                               |

Corps de création :

```json
{
  "id": "uuid facultatif",
  "nom": "Houngbédji",
  "prenoms": "Codjo",
  "profession": "Commerçante",
  "quartier": "Zogbo",
  "telephone": "22997000002",
  "dateNaissance": "1990-04-12",
  "lieuNaissance": "Cotonou",
  "arrondissement": "...",
  "commune": "...",
  "photoId": "uuid de la photo déjà envoyée",
  "codeMembre": "3-014",
  "dateSouscription": "2026-10-29"
}
```

Obligatoires : `nom` et `prenoms` (2 caractères au moins), `profession`, `quartier`. Le reste est facultatif. Le serveur attribue `numeroMembre` (`MBR-00012`). La photo s'envoie **avant** (voir Médias) ; un `photoId` inconnu donne 400.

Objet `Membre` : `id, ownerId, numeroMembre, codeMembre, nom, prenoms, telephone, dateNaissance, lieuNaissance, profession, quartier, arrondissement, commune, photoId, dateSouscription, createdAt, updatedAt, serverSeq, version, deletedAt`.

**Pagination** : passer `nextCursor` comme `cursor` à l'appel suivant tant que `hasMore` est vrai.

### Médias (photos)

`POST /media` en `multipart/form-data` : champ `file` (JPEG ou PNG, 2 Mo au plus), champ `id` facultatif (UUID). Réponse **201** `{ id, checksum, mime, url }`, où `url` vaut `/api/v1/media/<id>`. Une même image envoyée deux fois renvoie le même média.

`GET /media/:id` renvoie l'image. **Cette route demande le jeton** : une balise `<img src="...">` ne l'envoie pas. Charger l'image avec `fetch` puis l'afficher par une URL locale :

```ts
const res = await fetch(`${API}/media/${id}`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
const url = URL.createObjectURL(await res.blob());
// <img src={url}> ; appeler URL.revokeObjectURL(url) quand l'image n'est plus affichée.
```

Un AGENT ne lit que les photos de ses membres (404 sinon).

### Contrats

| Route                                         | Corps / paramètres                                                                                                    | Réponse                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `POST /contrats`                              | `{ "id": "uuid facultatif", "membreId": "uuid", "groupe": "GROUPE_1", "miseAmount": 500, "startDate": "2026-10-29" }` | **201**, le contrat                          |
| `GET /contrats/:id`                           |                                                                                                                       | Contrat + `derive` (voir ci-dessous)         |
| `GET /contrats/:id/versements?limit=&cursor=` | pagination comme les membres (`cursor` = `serverSeq`)                                                                 | `{ data: Versement[], nextCursor, hasMore }` |
| `GET /contrats/:id/avances`                   |                                                                                                                       | `Avance[]`                                   |
| `GET /contrats/:id/retraits`                  |                                                                                                                       | `Retrait[]`                                  |
| `GET /contrats/:id/releve?mois=`              | `mois` : numéro du mois du cycle (GROUPE_1) ; mois courant par défaut                                                 | Relevé (voir ci-dessous)                     |

Les paramètres du groupe sont copiés sur le contrat à la souscription :

|                                           | `GROUPE_1`                            | `GROUPE_2`                                 |
| ----------------------------------------- | ------------------------------------- | ------------------------------------------ |
| Cadence                                   | `QUOTIDIENNE`                         | `TOUS_LES_N_JOURS` (`intervalleJours` = 5) |
| Mises par mois / objectif (`targetMises`) | 31 / 372                              | 8 / 96                                     |
| Commission                                | 1 mise par mois (`commissionParMois`) | 3 mises par cycle (`commissionParCycle`)   |
| Cycle                                     | 12 mois                               | 12 mois                                    |

Objet `Contrat` : `id, membreId, ownerId, groupe, cadence, intervalleJours, moisParCycle, misesParMois, targetMises, miseAmount, commissionParMois, commissionParCycle, creditAutorise, maxAvances, startDate, endDate, statut, createdAt, updatedAt, serverSeq, version, deletedAt`. `statut` : `ACTIF`, `TERMINE`, `SUSPENDU` ou `CLOTURE_ANTICIPEE`.

`GET /contrats/:id` ajoute (en **nombres**) :

```json
"derive": {
  "misesVersees": 40,
  "soldeBrut": 20000,
  "commissionDue": 1000,
  "interetDu": 250,
  "avanceRestante": 10000,
  "totalRetire": 0,
  "soldeDisponible": 20000,
  "soldeNet": 8750,
  "progression": 11,
  "statutCollecte": "a_collecter"
}
```

`progression` est un pourcentage (0 à 100). `statutCollecte` : `paye`, `a_collecter`, `en_retard` ou `termine`.

Relevé (en **nombres**) : `{ periode: "mois-2" | "cycle", mois?: 2, totalCotisation, commission, avanceImputee, interet, montantNetAVirer }`. `periode` vaut `cycle` pour GROUPE_2.

### Mouvements d'argent

Les trois routes sont idempotentes par `id` (§5) et répondent **201** avec l'enregistrement (ou l'existant si l'`id` est déjà connu). Une règle violée donne **422** `BUSINESS_RULE` avec un message à afficher : contrat non actif, date terrain hors bornes, objectif dépassé, plafond d'avance, montant supérieur au récupérable…

**Encaisser des mises** : `POST /versements`

```json
{
  "id": "uuid",
  "contratId": "uuid",
  "misesCount": 3,
  "paidAt": "2026-10-29T10:00:00Z"
}
```

```json
{
  "id": "466fa55f-...",
  "contratId": "8cf8b257-...",
  "agentId": "9d507c51-...",
  "misesCount": 3,
  "amount": "1500",
  "paidAt": "2026-10-29T10:00:00.000Z",
  "numeroMiseDebut": 1,
  "numeroMiseFin": 3,
  "receiptNumber": "REC-20261029-00003",
  "idempotencyKey": "466fa55f-...",
  "createdAt": "...",
  "serverSeq": "1042"
}
```

Le serveur calcule `amount` (`misesCount` × mise) et attribue le numéro de reçu. Le contrat passe en `TERMINE` à l'objectif.

**Accorder une avance** : `POST /avances`

```json
{
  "id": "uuid",
  "contratId": "uuid",
  "nbMois": 1,
  "montant": 10000,
  "dateAvance": "2026-10-29T11:00:00Z"
}
```

`nbMois` de 1 à 3. Plafond : 4/5 du montant mensuel attendu par mois avancé ; intérêt : mise / 2 par mois ; au plus `maxAvances` (2) par contrat. Réponse : `{ id, contratId, agentId, rang, nbMois, montant, montantAttenduRef, interet, dateAvance, receiptNumber, idempotencyKey, createdAt, serverSeq }`.

**Effectuer un retrait** : `POST /retraits`

```json
{
  "id": "uuid",
  "contratId": "uuid",
  "type": "PARTIEL",
  "montant": 1000,
  "dateRetrait": "2026-10-29T15:00:00Z"
}
```

- `PARTIEL` : `montant` obligatoire, c'est ce que **reçoit le membre** (au plus le récupérable, sinon 422). Le serveur y ajoute la commission et l'intérêt restants pour obtenir `montantBrut` (ex. : 1000 demandés + 500 de commission = 1500 brut).
- `TOTAL` : sans `montant` ; le membre reçoit le net récupérable et le contrat passe en `CLOTURE_ANTICIPEE`.
- La commission et l'intérêt restants sont prélevés en priorité, une seule fois ; le net n'est jamais négatif.

Réponse : `{ id, contratId, agentId, type, montantBrut, commissionPrelevee, interetDu, montantNet, dateRetrait, receiptNumber, idempotencyKey, createdAt, serverSeq }`. **Le montant remis au membre est `montantNet`.**

### Tableau de bord

| Route                  | Paramètres                                                                                                | Réponse                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /dashboard/stats` | `period` : `today` (défaut), `yesterday`, `week`, `month`, `custom` ; `date` (`YYYY-MM-DD`) pour `custom` | `{ periode, collecte, attenduJournalier, contratsActifs, payes, aCollecter, enRetard, nouveauxMembres, commissions, avancesEnCours }` (nombres) |
| `GET /dashboard/file`  | `period`, `date`, `statut` (`paye`, `a_collecter`, `en_retard`, `termine`), `q` (nom du membre)           | `{ data: Ligne[], total }`, triée par priorité (en retard d'abord)                                                                              |

`Ligne` : `{ contratId, groupe, miseAmount, membre: { id, numeroMembre, nom, prenoms, telephone, quartier }, misesVersees, soldeBrut, statutCollecte }` (montants en nombres).

Un AGENT ne voit que ses contrats ; SUPERVISEUR et ADMIN voient tout.

### Rapport de caisse

| Route                                         | Rôles                                         | Réponse                            |
| --------------------------------------------- | --------------------------------------------- | ---------------------------------- |
| `GET /caisse?date=YYYY-MM-DD`                 | SUPERVISEUR, ADMIN                            | Synthèse du jour, tous les comptes |
| `GET /caisse/agents/:agentId?date=YYYY-MM-DD` | tous (un AGENT ne lit que le sien, 404 sinon) | Rapport détaillé d'un compte       |

`date` : jour du Bénin, aujourd'hui par défaut ; une date future est refusée (400).

Totaux (montants en **chaînes**) :

```json
"totaux": {
  "encaisse": "6000",
  "avances": "1000",
  "retraitsNets": "1000",
  "decaisse": "2000",
  "soldeAttendu": "4000",
  "nbMouvements": 4
}
```

`soldeAttendu` peut être négatif (`soldeNegatif: true`) : le signaler visuellement.

Rapport d'un compte : `{ agent: { id, nom, role, actif, supprime }, date, fuseau, genereA, totaux, soldeNegatif, arriveesTardives, lignes, receptionsTardives }`.

- `lignes` : un reçu par ligne, avec `type` (`VERSEMENT`, `AVANCE`, `RETRAIT`), `dateTerrain`, `recuServeurA`, `arriveeTardive`, `receiptNumber`, `montant`, `contratId`, `membre: { id, nom, prenoms, numeroMembre, codeMembre }`, plus les champs propres au type (`misesCount` ; `typeRetrait`, `montantBrut`, `commissionPrelevee`, `interetDu`).
- `arriveeTardive` : mouvement daté de ce jour mais reçu par le serveur plus tard (synchro hors ligne).
- `receptionsTardives` : mouvements reçus ce jour mais datés de jours précédents, avec un récapitulatif `parJour`. Ils ne sont **pas** dans les totaux du jour : ce sont des corrections des jours passés.

La synthèse (`GET /caisse`) a la même structure de totaux, avec `agents: [{ agent, totaux, soldeNegatif, arriveesTardives, receptionsTardives }]`.

### Synchronisation hors ligne (app agent)

Réservé à l'app mobile des agents ; le back office n'en a normalement pas besoin.

- `POST /sync/push` : `{ membres: [], contrats: [], versements: [], avances: [], retraits: [] }`, mêmes champs que les routes directes, avec `id` **obligatoire** partout, et des dates terrain obligatoires. Réponse **200** `{ applied: { membres, contrats, versements, avances, retraits }, conflicts: [{ entity, id, reason }], serverSeq }`. Une entité refusée devient un conflit, les autres sont appliquées.
- `GET /sync/pull?since=<serverSeq>&limit=` (200 par défaut, 1000 au plus) : `{ changes: { membres, contrats, versements, avances, retraits }, nextCursor, hasMore }`. Commencer à `since=0`, puis repasser `nextCursor` tant que `hasMore` est vrai. Un AGENT reçoit ses membres et contrats, et tous les mouvements de ses contrats, y compris ceux saisis par un superviseur.
- **Rattrapage après la mise à jour du 30/10/2026** : avant, le pull d'un agent omettait les mouvements saisis par un superviseur sur ses contrats. Les téléphones déjà synchronisés doivent refaire **une fois** un pull complet depuis `since=0` pour les récupérer.

## 7. Récapitulatif pour démarrer

1. Login, stocker les deux jetons, vérifier `mustChangePassword`.
2. Intercepteur HTTP : ajouter `Authorization`, sur 401 faire **un** refresh partagé puis rejouer, sinon déconnecter.
3. Afficher `message` des erreurs 422 tel quel, `fieldErrors` des 400 sous les champs, le `requestId` des 500.
4. Générer un UUID client pour chaque création et le réutiliser en cas de nouvelle tentative.
5. Montants : chaînes dans les entités et la caisse, nombres dans `derive`, relevé et dashboard.
6. Photos : `fetch` avec le jeton, puis `URL.createObjectURL`.
7. Prévoir le réveil lent du serveur gratuit (30 à 60 s).
