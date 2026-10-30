# 0004. Alertes de panne et d'erreurs

## Summary

Trois sources d'alerte, toutes par e-mail : UptimeRobot si `/api/v1/health` (qui vérifie aussi la base) ne répond plus, Sentry si l'API renvoie une erreur 500 (avec son `requestId`, sans aucune donnée personnelle), Healthchecks.io si une sauvegarde manque ou échoue. C'est la fonction 8 du scope.

## Requirements

**User stories**:
- En tant que responsable du pilote, je veux être prévenu en quelques minutes si l'API tombe ou renvoie des erreurs serveur, pour réagir avant que les agents ne bloquent sur le terrain.
- En tant que développeur, je veux retrouver le contexte d'une erreur à partir de son `requestId`.

**Acceptance criteria**:
- **AC-1**: Un moniteur UptimeRobot (offre gratuite) contrôle `https://<domaine>/api/v1/health` toutes les 5 minutes, avec le délai de réponse le plus long que permet l'offre, et envoie un e-mail quand il échoue et quand il revient ; il garde aussi Render éveillé. Si l'offre gratuite permet de n'alerter qu'après deux échecs de suite, ce réglage est activé (une seule lenteur de réveil ne donne pas d'alerte).
- **AC-2**: Avec `SENTRY_DSN` défini, l'API initialise Sentry (SDK `@sentry/nestjs`) au démarrage ; sans `SENTRY_DSN` (dev, tests), rien n'est initialisé ni envoyé.
- **AC-3**: Chaque réponse 5xx produite par `AllExceptionsFilter` est envoyée à Sentry une seule fois, avec les étiquettes `requestId` (la même valeur que dans le corps de la réponse), méthode et route (`request.route?.path`, sinon `inconnue`) ; les erreurs 4xx ne sont jamais envoyées. On n'ajoute pas `SentryGlobalFilter` (double envoi).
- **AC-4**: Aucun mot de passe, jeton, corps de requête, en tête, cookie ni nom de membre n'est envoyé à Sentry : capture du corps des requêtes coupée (`httpIntegration({ maxIncomingRequestBodySize: 'none' })`), `sendDefaultPii: false`, et un `beforeSend` qui retire `request.data`, `request.headers` et `request.cookies` de tout événement. Seuls partent l'erreur, sa pile, la route, le `requestId` et l'identifiant de l'agent connecté (`request.agent.id`) s'il existe.
- **AC-5**: Le middleware `requestId` n'accepte un `X-Request-Id` du client que s'il est un UUID ; sinon il en génère un. L'étiquette Sentry est donc toujours une valeur bornée.
- **AC-6**: Une règle d'alerte Sentry envoie un e-mail pour toute nouvelle erreur et pour toute erreur qui revient après avoir été résolue.
- **AC-7**: Trois checks Healthchecks.io de type **cron** (fuseau UTC), alignés sur les workflows : `17 1 * * *`, `17 2 * * 0`, `17 3 1 * *`, avec un délai de grâce de 2 heures ; un ping manquant ou un `/fail` envoie un e-mail.
- **AC-8**: Le guide `docs/exploitation/mise-en-ligne.md` décrit la création de ces trois comptes et de leurs alertes, et un test d'alerte de bout en bout a été fait une fois pour chacune avant le pilote.

## Design

**Sentry dans NestJS** (suivre la compétence `sentry-nestjs-sdk`) :
- `src/instrument.ts` importé en tout premier dans `src/main.ts` ; si `SENTRY_DSN` est défini, `Sentry.init({ dsn, environment: NODE_ENV, sendDefaultPii: false, tracesSampleRate: 0, integrations: [Sentry.httpIntegration({ maxIncomingRequestBodySize: 'none' })], beforeSend })` ;
- `beforeSend(event)` supprime `event.request.data`, `event.request.headers`, `event.request.cookies` et `event.request.query_string`, puis renvoie l'événement ;
- dans `AllExceptionsFilter`, pour un statut ≥ 500 : `Sentry.withScope((scope) => { scope.setTag('requestId', request.requestId); scope.setTag('route', request.route?.path ?? 'inconnue'); scope.setTag('methode', request.method); if (request.agent) scope.setUser({ id: request.agent.id }); Sentry.captureException(exception); })` ; sans initialisation, `captureException` ne fait rien ;
- `SENTRY_DSN` (URL, facultative) dans `env.validation.ts` ;
- pas de traces de performance : on reste loin du quota gratuit.

**`requestId`** : dans `request-id.middleware.ts`, la valeur reçue n'est gardée que si elle correspond à un UUID (regex des UUID v1 à v8), sinon `randomUUID()`.

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| alerte panne | état de l'API et de la base | réponse de `GET /api/v1/health` (200 ou 503) vue par UptimeRobot |
| alerte erreur | `requestId` | `request.requestId`, posé par le middleware (UUID) |
| alerte erreur | route, méthode | `request.route?.path`, `request.method` |
| alerte erreur | agent | `request.agent.id`, posé par `JwtAuthGuard` |
| alerte sauvegarde | état | pings des workflows |
| destinataire | e-mail | adresse du compte de chaque service |

**Critical test scenarios**:
- Filtre : une erreur non prévue (500) appelle `Sentry.captureException` une fois avec le bon `requestId` et la route ; une `NotFoundException` (404) ne l'appelle pas (test unitaire, Sentry simulé), verifies **AC-3**
- `beforeSend` : un événement avec corps, en têtes `Authorization` et cookies ressort sans eux, verifies **AC-4**
- `requestId` : un `X-Request-Id` UUID est repris ; `abc` ou une chaîne de 5 000 caractères est remplacé par un UUID neuf, verifies **AC-5**
- Sans `SENTRY_DSN`, l'app démarre et les tests d'intégration passent sans appel réseau, verifies **AC-2**
- Test réel avant le pilote : arrêter le service (e-mail UptimeRobot), provoquer une 500 (e-mail Sentry avec `requestId`, sans corps de requête), sauter un ping (e-mail Healthchecks.io), verifies **AC-1**, **AC-6**, **AC-7**, **AC-8**

## Build plan

1. `requestId` limité aux UUID, avec ses tests, satisfies **AC-5**
2. `@sentry/nestjs`, `src/instrument.ts` avec la coupure du corps et `beforeSend`, `SENTRY_DSN` dans l'env, satisfies **AC-2**, **AC-4**
3. Envoi des 5xx depuis `AllExceptionsFilter` et ses tests, satisfies **AC-3**, **AC-4**
4. Comptes et règles : moniteur UptimeRobot, règle d'alerte Sentry, trois checks cron Healthchecks.io, décrits dans le guide, satisfies **AC-1**, **AC-6**, **AC-7**, **AC-8**
5. Test d'alerte de bout en bout pour chacune, noté dans le guide, satisfies **AC-8**

## Rationale (short)

UptimeRobot ne voit que `/health` : il ne voit pas une route qui renvoie 500 pendant que le reste marche. Sentry comble ce trou avec le `requestId`, à condition de couper la capture du corps des requêtes, qui sinon enverrait les mots de passe du login. Render bloque l'envoi d'e-mails par SMTP sur son plan gratuit : on passe donc par des services qui envoient eux mêmes leurs e-mails. Des checks par cron évitent les fausses alertes des mois de 31 jours.
