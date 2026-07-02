import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { MediaService } from './media.service';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthAgent } from '@/modules/auth/types';

// Garde-fou dur au niveau multer (la validation fine se fait dans le service).
const LIMITE_DURE_OCTETS = 5 * 1024 * 1024;

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: LIMITE_DURE_OCTETS } }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('id') id?: string,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Fichier requis (champ multipart « file »).',
      });
    }
    const media = await this.media.enregistrer({
      id,
      buffer: file.buffer,
      mime: file.mimetype,
      taille: file.size,
    });
    return {
      id: media.id,
      checksum: media.checksum,
      mime: media.mime,
      url: `/api/v1/media/${media.id}`,
    };
  }

  @Get(':id')
  async servir(
    @CurrentUser() agent: AuthAgent,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { media, buffer } = await this.media.lireFichier(id, agent);
    res.setHeader('Content-Type', media.mime);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(buffer);
  }
}
