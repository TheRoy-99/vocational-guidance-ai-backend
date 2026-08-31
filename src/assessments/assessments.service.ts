import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAssessmentAnswerDto, CreateAssessmentEventDto, CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateAssessmentDto } from './dto/update-assessment.dto';
import { Prisma, VocationalAssessment } from '@prisma/client';
import { analyzeAnswers } from './utils/career-engine';

@Injectable()
export class AssessmentsService {
  private readonly logger = new Logger(AssessmentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    dto: CreateAssessmentDto,
  ): Promise<VocationalAssessment> {
    try {
      const rawAnswers = dto.rawAnswers as Record<string, unknown>;
      const isVocationalAreas = dto.assessmentType === 'VOCATIONAL_AREAS';
      const analysisResult = isVocationalAreas
        ? { topCareers: [], compatibility: [], strengths: [], analysis: 'Resultado generado por el motor vocacional adaptativo.' }
        : analyzeAnswers(rawAnswers);
      const rawAnswersJson = rawAnswers as Prisma.InputJsonValue;
      const scoresJson = JSON.parse(JSON.stringify(dto.vocationalResults ?? [])) as Prisma.InputJsonValue;

      return await this.prisma.vocationalAssessment.create({
        data: {
          userId,
          rawAnswers: rawAnswersJson,
          scores: scoresJson, // Guardar top careers como scores
          aiAnalysis: isVocationalAreas ? null : JSON.stringify(analysisResult),
          vocationalProfile: dto.vocationalProfile as Prisma.InputJsonValue | undefined,
          vocationalResults: dto.vocationalResults as Prisma.InputJsonValue | undefined,
          assessmentType: dto.assessmentType ?? 'LEGACY',
          engineVersion: dto.engineVersion,
          questionnaireVersion: dto.questionnaireVersion,
          scoringVersion: dto.scoringVersion,
          currentPhase: dto.currentPhase,
          status: isVocationalAreas && !dto.vocationalResults ? 'IN_PROGRESS' : isVocationalAreas ? 'COMPLETED' : 'PROCESSED',
          completedAt: isVocationalAreas && dto.vocationalResults ? new Date() : undefined,
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

  async addAnswer(id: string, userId: string, dto: CreateAssessmentAnswerDto) {
    await this.findById(id, userId);
    return this.prisma.assessmentAnswer.upsert({
      where: { assessmentId_questionId: { assessmentId: id, questionId: dto.questionId } },
      create: {
        id: dto.id,
        assessmentId: id,
        questionId: dto.questionId,
        phase: dto.phase,
        answerValue: dto.answerValue as Prisma.InputJsonValue,
        position: dto.position,
        questionText: dto.questionText,
        questionType: dto.questionType,
        options: dto.options as Prisma.InputJsonValue | undefined,
      },
      update: {
        phase: dto.phase,
        answerValue: dto.answerValue as Prisma.InputJsonValue,
        position: dto.position,
        questionText: dto.questionText,
        questionType: dto.questionType,
        options: dto.options as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async addEvent(id: string, userId: string, dto: CreateAssessmentEventDto) {
    await this.findById(id, userId);
    return this.prisma.assessmentPhaseEvent.upsert({
      where: { eventId: dto.eventId },
      create: { id: dto.id, eventId: dto.eventId, assessmentId: id, phase: dto.phase, eventType: dto.eventType, questionId: dto.questionId, metadata: dto.metadata as Prisma.InputJsonValue | undefined },
      update: { phase: dto.phase, eventType: dto.eventType, questionId: dto.questionId, metadata: dto.metadata as Prisma.InputJsonValue | undefined },
    });
  }

  async finalize(id: string, userId: string, dto: CreateAssessmentDto) {
    await this.findById(id, userId);
    if (!dto.vocationalProfile || !dto.vocationalResults) throw new InternalServerErrorException('Faltan snapshots vocacionales');
    const vocationalResults = dto.vocationalResults;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.vocationalAssessment.update({
        where: { id },
        data: {
          rawAnswers: dto.rawAnswers as Prisma.InputJsonValue,
          vocationalProfile: dto.vocationalProfile as Prisma.InputJsonValue,
          vocationalResults: vocationalResults as Prisma.InputJsonValue,
          scores: vocationalResults as Prisma.InputJsonValue,
          assessmentType: 'VOCATIONAL_AREAS',
          engineVersion: dto.engineVersion,
          questionnaireVersion: dto.questionnaireVersion,
          scoringVersion: dto.scoringVersion,
          currentPhase: dto.currentPhase,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
      await tx.assessmentAreaResult.deleteMany({ where: { assessmentId: id } });
      await tx.assessmentAreaResult.createMany({
        data: vocationalResults.map((result: any, index: number) => ({
          assessmentId: id, areaId: result.area, score: result.score, confidence: result.confidence, rank: index + 1,
          percentage: result.percentage ?? null, dimensions: result.dimensions as Prisma.InputJsonValue | undefined,
        })),
      });
      return updated;
    });
  }

  async findAll(userId: string): Promise<VocationalAssessment[]> {
    return this.prisma.vocationalAssessment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, userId: string): Promise<VocationalAssessment> {
    const assessment = await this.prisma.vocationalAssessment.findUnique({
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
  ): Promise<VocationalAssessment> {
    // Verificar que el assessment existe y pertenece al usuario
    const assessment = await this.findById(id, userId);

    try {
      const data: Prisma.VocationalAssessmentUpdateInput = {
        ...(dto.rawAnswers !== undefined
          ? { rawAnswers: dto.rawAnswers as Prisma.InputJsonValue }
          : {}),
        ...(dto.scores !== undefined
          ? { scores: dto.scores as Prisma.InputJsonValue }
          : {}),
        ...(dto.aiAnalysis !== undefined ? { aiAnalysis: dto.aiAnalysis } : {}),
        ...(dto.vocationalProfile !== undefined ? { vocationalProfile: dto.vocationalProfile as Prisma.InputJsonValue } : {}),
        ...(dto.vocationalResults !== undefined ? { vocationalResults: dto.vocationalResults as Prisma.InputJsonValue } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      };

      return await this.prisma.vocationalAssessment.update({
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
      await this.prisma.vocationalAssessment.delete({
        where: { id },
      });
    } catch (error: any) {
      throw new InternalServerErrorException(
        'Error al eliminar el assessment',
      );
    }
  }
}
