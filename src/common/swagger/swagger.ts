import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const CHEMIN_DOCS = 'api/v1/docs';

/**
 * Documentation OpenAPI de toute l'API, servie sur `/api/v1/docs` (interface) et
 * `/api/v1/docs-json` (document brut). Activée seulement si `SWAGGER_ENABLED=true`.
 */
export function configurerSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('API Agbajowo')
    .setDescription(
      [
        'API de la tontine Agbajowo : collecte des mises par les agents terrain, avances, retraits, relevés, rapport de caisse et synchronisation hors ligne.',
        '',
        '**Authentification** : `POST /api/v1/auth/login` renvoie un `accessToken` à passer en `Authorization: Bearer <jeton>` (bouton **Authorize**).',
        '',
        '**Rôles** : un `AGENT` ne voit que ses propres données (404 sinon) ; `SUPERVISEUR` et `ADMIN` voient tout.',
        '',
        '**Montants** : entiers en FCFA, sérialisés en chaînes (`"1500"`, `"-1000"`).',
        '',
        '**Dates terrain** (`paidAt`, `dateAvance`, `dateRetrait`) : ISO 8601 avec fuseau explicite (`2026-10-29T22:30:00Z`), au plus 15 minutes dans le futur, au plus 30 jours dans le passé, pas avant le début du contrat. Les jours de rapport sont ceux du Bénin (UTC+1).',
        '',
        '**Erreurs** : toujours `{ code, message, details?, requestId }`.',
      ].join('\n'),
    )
    .setVersion('v1')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(CHEMIN_DOCS, app, document, {
    jsonDocumentUrl: `${CHEMIN_DOCS}-json`,
    swaggerOptions: { persistAuthorization: true },
  });
}
