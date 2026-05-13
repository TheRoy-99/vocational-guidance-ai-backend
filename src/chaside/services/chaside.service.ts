import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubmitAssessmentDto } from '../dto/submit-assessment.dto';
import { VocationalChatDto } from '../dto/vocational-chat.dto';
import { ChasideScoringService } from './chaside-scoring.service';
import { ChasideAiService } from './chaside-ai.service';

export const CHASIDE_QUEUE = 'chaside-analysis';
const CHASIDE_CATEGORIES = new Set(['C', 'H', 'A', 'S', 'I', 'D', 'E', 'LOCATION', 'INTEREST', 'ACTIVITY', 'ACADEMIC']);

function isChasideAssessmentRawAnswers(value: unknown): value is Array<{ category?: string }> {
  return Array.isArray(value) && value.some((item) => {
    if (!item || typeof item !== 'object') return false;
    const category = (item as { category?: unknown }).category;
    return typeof category === 'string' && CHASIDE_CATEGORIES.has(category);
  });
}

@Injectable()
export class ChasideService {
  private readonly logger = new Logger(ChasideService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringService: ChasideScoringService,
    private readonly aiService: ChasideAiService,
  ) {}

  async submit(userId: string, dto: SubmitAssessmentDto) {
    // Guarda y procesa de inmediato para que el usuario vea recomendaciones sin depender de Redis.
    const assessment = await this.prisma.chasideAssessment.create({
      data: {
        userId,
        rawAnswers: dto.answers as any,
        status: 'PENDING',
      },
    });

    try {
      await this.processAssessment(assessment.id);
      return { assessmentId: assessment.id, status: 'PROCESSED' };
    } catch (e: any) {
      this.logger.error('Error procesando CHASIDE de forma inmediata', e?.message ?? e);
      await this.prisma.chasideAssessment.update({
        where: { id: assessment.id },
        data: { status: 'FAILED' },
      });
      return { assessmentId: assessment.id, status: 'FAILED', queueError: e?.message ?? String(e) };
    }
  }

  async processAssessment(assessmentId: string) {
    const assessment = await this.prisma.chasideAssessment.findUnique({
      where: { id: assessmentId },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment no encontrado');
    }

    if (assessment.status === 'PROCESSED' || assessment.status === 'FAILED') {
      return assessment;
    }

    await this.prisma.chasideAssessment.update({
      where: { id: assessmentId },
      data: { status: 'PROCESSING' },
    });

    const { scores, contextData } = this.scoringService.process(assessment.rawAnswers as any);
    const aiResult = await this.aiService.analyze(scores, contextData);

    return this.prisma.chasideAssessment.update({
      where: { id: assessmentId },
      data: {
        scores: scores as any,
        contextData: contextData as any,
        aiAnalysis: aiResult.narrativeAnalysis,
        topCareers: aiResult.topCareers as any,
        notRecommended: aiResult.notRecommended as any,
        idealEnvironment: aiResult.idealWorkEnvironment,
        status: 'PROCESSED',
      },
    });
  }

  async getResults(assessmentId: string, userId: string) {
    const assessment = await this.prisma.chasideAssessment.findFirst({
      where: { id: assessmentId, userId }, // userId para que no vea resultados ajenos
    });

    if (!assessment) {
      throw new NotFoundException('Assessment no encontrado');
    }

    if (assessment.status === 'PENDING') {
      return this.processAssessment(assessment.id);
    }

    return assessment;
  }

  async getMyAssessments(userId: string) {
    const assessments = await this.prisma.chasideAssessment.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        scores: true,
        rawAnswers: true,
        aiAnalysis: true,
        topCareers: true,
        notRecommended: true,
        idealEnvironment: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const chasideAssessments = assessments.filter((assessment) => isChasideAssessmentRawAnswers(assessment.rawAnswers));

    const pendingAssessments = chasideAssessments.filter((assessment) => assessment.status === 'PENDING');

    for (const assessment of pendingAssessments) {
      await this.processAssessment(assessment.id);
    }

    const refreshedAssessments = await this.prisma.chasideAssessment.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        scores: true,
        rawAnswers: true,
        aiAnalysis: true,
        topCareers: true,
        notRecommended: true,
        idealEnvironment: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return refreshedAssessments.filter((assessment) => isChasideAssessmentRawAnswers(assessment.rawAnswers));
  }

  async chat(userId: string, dto: VocationalChatDto) {
    const recentAssessments = await this.prisma.chasideAssessment.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        rawAnswers: true,
        scores: true,
        contextData: true,
        aiAnalysis: true,
        topCareers: true,
        notRecommended: true,
        idealEnvironment: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    const explicitAssessment = dto.assessmentId
      ? recentAssessments.find((assessment) => assessment.id === dto.assessmentId)
      : null;

    const currentAssessment = explicitAssessment ?? recentAssessments[0] ?? null;

    if (!currentAssessment) {
      return {
        answer:
          'Aún no tengo resultados vocacionales tuyos para usar como contexto. Completa primero tu evaluación para que pueda darte orientación personalizada basada en tus datos.',
        assessmentId: null,
        status: 'NO_ASSESSMENT',
      };
    }

    let resolvedAssessment = currentAssessment;

    if (resolvedAssessment.status !== 'PROCESSED') {
      resolvedAssessment = await this.processAssessment(resolvedAssessment.id);
    }

    const response = await this.aiService.answerVocationalChat({
      message: dto.message,
      currentAssessment: resolvedAssessment,
      recentAssessments,
    });

    return {
      answer: response,
      assessmentId: resolvedAssessment.id,
      status: 'OK',
    };
  }
}
