import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { ChasideScoringService } from '../services/chaside-scoring.service';
import { ChasideAiService } from '../services/chaside-ai.service';
import { AnswerDto } from '../dto/submit-assessment.dto';
import { CHASIDE_QUEUE } from '../services/chaside.service';

@Processor(CHASIDE_QUEUE)
export class ChasideProcessor {
  private readonly logger = new Logger(ChasideProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringService: ChasideScoringService,
    private readonly aiService: ChasideAiService,
  ) {}

  @Process('process-assessment')
  async handleAssessment(job: Job<{ assessmentId: string }>) {
    const { assessmentId } = job.data;
    this.logger.log(`Procesando assessment ${assessmentId}...`);

    // 1. Marcar como PROCESSING
    await this.prisma.chasideAssessment.update({
      where: { id: assessmentId },
      data: { status: 'PROCESSING' },
    });

    try {
      // 2. Obtener respuestas crudas de la DB
      const assessment = await this.prisma.chasideAssessment.findUnique({
        where: { id: assessmentId },
      });

      const answers = assessment!.rawAnswers as unknown as AnswerDto[];

      // 3. Calcular scores CHASIDE + extraer contexto
      const { scores, contextData } = this.scoringService.process(answers);

      // 4. Llamar a Claude con scores + contexto
      const aiResult = await this.aiService.analyze(scores, contextData);

      // 5. Guardar resultados y marcar PROCESSED
      await this.prisma.chasideAssessment.update({
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

      this.logger.log(`Assessment ${assessmentId} procesado exitosamente`);
    } catch (error) {
      // BullMQ reintentará automáticamente según la config de attempts
      this.logger.error(`Error procesando assessment ${assessmentId}`, error);

      await this.prisma.chasideAssessment.update({
        where: { id: assessmentId },
        data: { status: 'FAILED' },
      });

      throw error; // Re-throw para que BullMQ sepa que falló y reintente
    }
  }
}
