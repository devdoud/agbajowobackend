import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marque une route comme publique (ignore le guard JWT global). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
