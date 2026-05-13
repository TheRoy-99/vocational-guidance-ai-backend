import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateAssessmentDto } from './dto/update-assessment.dto';
import { Prisma, ChasideAssessment } from '@prisma/client';
import { analyzeAnswers } from './utils/career-engine';

@Injectable()
export class AssessmentsService {
  private readonly logger = new Logger(AssessmentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    dto: CreateAssessmentDto,
  ): Promise<ChasideAssessment> {
    try {
      // Procesar respuestas con el motor de recomendaciones
      const rawAnswers = dto.rawAnswers as Record<string, unknown>;
      const analysisResult = analyzeAnswers(rawAnswers);
      const rawAnswersJson = rawAnswers as Prisma.InputJsonValue;
      const scoresJson = JSON.parse(JSON.stringify(analysisResult.topCareers)) as Prisma.InputJsonValue;

      return await this.prisma.chasideAssessment.create({
        data: {
          userId,
          rawAnswers: rawAnswersJson,
          scores: scoresJson, // Guardar top careers como scores
          aiAnalysis: JSON.stringify(analysisResult), // Guardar análisis completo
          status: 'PROCESSED',
        },
      });
    } catch (error: any) {
      this.logger.error(
        'Error creating assessment',
        error?.stack || error?.message || String(error),
      );
      if (error.code === 'P2003') {
        throw new NotFoundException('Usuario no encontrado');
      }
      throw new InternalServerErrorException(
        'Error al crear el assessment',
      );
    }
  }

  async findAll(userId: string): Promise<ChasideAssessment[]> {
    return this.prisma.chasideAssessment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, userId: string): Promise<ChasideAssessment> {
    const assessment = await this.prisma.chasideAssessment.findUnique({
      where: { id },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment no encontrado');
    }

    // Verificar que el assessment pertenece al usuario actual
    if (assessment.userId !== userId) {
      throw new ForbiddenException('No tienes acceso a este assessment');
    }

    return assessment;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateAssessmentDto,
  ): Promise<ChasideAssessment> {
    // Verificar que el assessment existe y pertenece al usuario
    const assessment = await this.findById(id, userId);

    try {
      const data: Prisma.ChasideAssessmentUpdateInput = {
        ...(dto.rawAnswers !== undefined
          ? { rawAnswers: dto.rawAnswers as Prisma.InputJsonValue }
          : {}),
        ...(dto.scores !== undefined
          ? { scores: dto.scores as Prisma.InputJsonValue }
          : {}),
        ...(dto.aiAnalysis !== undefined ? { aiAnalysis: dto.aiAnalysis } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      };

      return await this.prisma.chasideAssessment.update({
        where: { id },
        data,
      });
    } catch (error: any) {
      throw new InternalServerErrorException(
        'Error al actualizar el assessment',
      );
    }
  }

  async remove(id: string, userId: string): Promise<void> {
    // Verificar que el assessment existe y pertenece al usuario
    await this.findById(id, userId);

    try {
      await this.prisma.chasideAssessment.delete({
        where: { id },
      });
    } catch (error: any) {
      throw new InternalServerErrorException(
        'Error al eliminar el assessment',
      );
    }
  }
}
