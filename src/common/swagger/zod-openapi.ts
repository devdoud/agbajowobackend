import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  ZodOptional,
  type ZodObject,
  type ZodRawShape,
  type ZodTypeAny,
} from 'zod';
import { ignoreOverride, zodToJsonSchema } from 'zod-to-json-schema';
import {
  DESCRIPTION_DATE_TERRAIN,
  DESCRIPTION_DATE_TERRAIN_SYNCHRO,
  DESCRIPTION_HORLOGE_CLIENT,
} from '@/common/schemas/date-terrain.schema';

/**
 * Décorateurs Swagger tirés des schémas Zod des DTO : la documentation décrit
 * exactement ce que `ZodValidationPipe` valide, sans second modèle à tenir à jour.
 */

/** Signature simplifiée : l'inférence de `zodToJsonSchema` est trop profonde pour tsc. */
const convertir = zodToJsonSchema as unknown as (
  schema: ZodTypeAny,
  options: {
    target: 'openApi3';
    $refStrategy: 'none';
    override: (def: { description?: string }) => unknown;
  },
) => SchemaObject & { $schema?: string };

/** Convertit un schéma Zod en schéma OpenAPI 3 (sans références, sans `$schema`). */
export function versOpenApi(schema: ZodTypeAny): SchemaObject {
  const json = convertir(schema, {
    target: 'openApi3',
    $refStrategy: 'none',
    // La date terrain est un `z.unknown()` transformé (pour refuser `null` avec le
    // bon message) : sans cela, la doc n'en montrerait pas le type.
    override: (def) =>
      def.description === DESCRIPTION_DATE_TERRAIN ||
      def.description === DESCRIPTION_DATE_TERRAIN_SYNCHRO ||
      def.description === DESCRIPTION_HORLOGE_CLIENT
        ? {
            type: 'string',
            format: 'date-time',
            description: def.description,
            example: '2026-10-29T22:30:00Z',
          }
        : ignoreOverride,
  });
  delete json.$schema;
  return json;
}

/** Corps de requête décrit par un schéma Zod. */
export function ApiCorpsZod(schema: ZodTypeAny) {
  return ApiBody({ schema: versOpenApi(schema) });
}

/** Paramètres de query, un par clé du schéma Zod. */
export function ApiRequeteZod<T extends ZodRawShape>(schema: ZodObject<T>) {
  return applyDecorators(
    ...Object.entries<ZodTypeAny>(schema.shape).map(([name, champ]) => {
      // Un champ facultatif sortirait en `anyOf [not {}, …]` : on décrit son contenu.
      const contenu: ZodTypeAny =
        champ instanceof ZodOptional ? (champ.unwrap() as ZodTypeAny) : champ;
      return ApiQuery({
        name,
        required: !champ.isOptional(),
        schema: versOpenApi(contenu),
        description: contenu.description ?? champ.description,
      });
    }),
  );
}

/** Paramètres de chemin, un par clé du schéma Zod. */
export function ApiParamsZod<T extends ZodRawShape>(schema: ZodObject<T>) {
  return applyDecorators(
    ...Object.entries<ZodTypeAny>(schema.shape).map(([name, champ]) =>
      ApiParam({ name, schema: versOpenApi(champ) }),
    ),
  );
}

/** Format commun de toutes les erreurs (`AllExceptionsFilter`). */
export const SCHEMA_ERREUR: SchemaObject = {
  type: 'object',
  required: ['code', 'message', 'requestId'],
  properties: {
    code: { type: 'string', example: 'VALIDATION_ERROR' },
    message: { type: 'string', example: 'Payload invalide.' },
    details: {
      type: 'object',
      description: 'Détail de validation (erreurs Zod), si présent.',
    },
    requestId: { type: 'string', format: 'uuid' },
  },
};

const ERREURS: Record<number, string> = {
  400: 'VALIDATION_ERROR : entrée invalide.',
  401: 'UNAUTHENTICATED : jeton absent, invalide ou expiré.',
  403: 'FORBIDDEN : rôle insuffisant.',
  404: 'NOT_FOUND : ressource introuvable ou hors de votre portée.',
  409: 'CONFLICT : ressource déjà existante.',
  422: 'BUSINESS_RULE : règle métier violée (message explicite).',
  429: 'RATE_LIMITED : trop de requêtes.',
};

/** Réponses d'erreur possibles d'une route, toutes au format commun. */
export function ApiErreurs(...codes: number[]) {
  return applyDecorators(
    ...codes.map((status) =>
      ApiResponse({
        status,
        description: ERREURS[status],
        schema: SCHEMA_ERREUR,
      }),
    ),
  );
}
