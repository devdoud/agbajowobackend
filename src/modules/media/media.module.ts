import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import type { Env } from '@/config/env.validation';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { StockageDisque } from './stockage/stockage-disque';
import { StockageS3 } from './stockage/stockage-s3';
import { STOCKAGE_PHOTOS } from './stockage/stockage-photos';

@Module({
  controllers: [MediaController],
  providers: [
    MediaService,
    {
      // Disque local par défaut ; S3 (Supabase Storage) quand MEDIA_DRIVER=s3.
      // validateEnv garantit que les variables S3_* existent dans ce cas.
      provide: STOCKAGE_PHOTOS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        if (config.get('MEDIA_DRIVER', { infer: true }) !== 's3') {
          return new StockageDisque(config.get('MEDIA_DIR', { infer: true }));
        }
        const client = new S3Client({
          endpoint: config.get('S3_ENDPOINT', { infer: true }),
          region: config.get('S3_REGION', { infer: true }),
          forcePathStyle: true,
          credentials: {
            accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true }) ?? '',
            secretAccessKey:
              config.get('S3_SECRET_ACCESS_KEY', { infer: true }) ?? '',
          },
        });
        return new StockageS3(
          client,
          config.get('S3_BUCKET', { infer: true }) ?? '',
        );
      },
    },
  ],
  exports: [MediaService],
})
export class MediaModule {}
