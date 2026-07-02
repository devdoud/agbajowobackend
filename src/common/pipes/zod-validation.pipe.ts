import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Valide et type le payload d'entrée avec un schéma Zod.
 * Usage : `@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto`.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Payload invalide.',
        details: result.error.flatten(),
      });
    }
    return result.data;
  }
}
