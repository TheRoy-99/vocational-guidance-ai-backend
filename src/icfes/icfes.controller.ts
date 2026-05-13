import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IcfesService } from './icfes.service';

type UploadedPdfFile = {
  buffer: Buffer;
  originalname: string;
  size: number;
  mimetype: string;
};

@Controller('icfes')
@UseGuards(JwtAuthGuard)
export class IcfesController {
  constructor(private readonly icfesService: IcfesService) {}

  @Post('analyze')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 8 * 1024 * 1024,
      },
      fileFilter: (_request, file, callback) => {
        if (file.mimetype !== 'application/pdf') {
          callback(new BadRequestException('Solo se permiten archivos PDF'), false);
          return;
        }

        callback(null, true);
      },
    }),
  )
  async analyze(@UploadedFile() file: UploadedPdfFile, @Request() req: any) {
    if (!file) {
      throw new BadRequestException('Debes adjuntar un archivo PDF');
    }

    return this.icfesService.analyze(req.user.id, file);
  }

  @Get('latest')
  async getLatest(@Request() req: any) {
    return this.icfesService.findLatest(req.user.id);
  }

  @Get('me')
  async getMyAnalyses(@Request() req: any) {
    return this.icfesService.findAll(req.user.id);
  }
}