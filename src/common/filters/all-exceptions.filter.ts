import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

interface CorpsErreur {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

const CODE_PAR_STATUT: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'BUSINESS_RULE',
  429: 'RATE_LIMITED',
};

/**
 * Filtre global : normalise toutes les erreurs en `{ code, message, details?, requestId }`
 * (doc 06 §3). Traduit les HttpException, les erreurs Prisma connues, et masque les
 * erreurs inattendues (500 générique).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();

    const { status, corps } = this.resoudre(exception);
    corps.requestId = request.requestId;

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status} [${request.requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} → ${status} ${corps.code} [${request.requestId}]`,
      );
    }

    response.status(status).json(corps);
  }

  private resoudre(exception: unknown): { status: number; corps: CorpsErreur } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const rep = exception.getResponse();
      if (typeof rep === 'object' && rep !== null) {
        const obj = rep as Record<string, unknown>;
        return {
          status,
          corps: {
            code:
              typeof obj.code === 'string'
                ? obj.code
                : (CODE_PAR_STATUT[status] ?? 'ERROR'),
            message: this.messageDe(obj.message) ?? exception.message,
            details: obj.details,
          },
        };
      }
      return {
        status,
        corps: {
          code: CODE_PAR_STATUT[status] ?? 'ERROR',
          message: typeof rep === 'string' ? rep : exception.message,
        },
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          status: 409,
          corps: { code: 'CONFLICT', message: 'Ressource déjà existante.' },
        };
      }
      if (exception.code === 'P2025') {
        return {
          status: 404,
          corps: { code: 'NOT_FOUND', message: 'Ressource introuvable.' },
        };
      }
      if (exception.code === 'P2003') {
        return {
          status: 409,
          corps: { code: 'CONFLICT', message: 'Référence invalide.' },
        };
      }
    }

    return {
      status: 500,
      corps: { code: 'INTERNAL', message: 'Erreur interne du serveur.' },
    };
  }

  private messageDe(message: unknown): string | undefined {
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join(' ; ');
    return undefined;
  }
}
