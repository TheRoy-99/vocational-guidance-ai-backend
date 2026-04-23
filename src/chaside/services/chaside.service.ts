import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { SubmitAssessmentDto } from '../dto/submit-assessment.dto';

export const CHASIDE_QUEUE = 'chaside-analysis';

@Injectable()
export class ChasideService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(CHASIDE_QUEUE) private readonly chasideQueue: Queue,
  ) {}

  async submit(userId: string, dto: SubmitAssessmentDto) {
    // 1. Guarda en DB con status PENDING
    const assessment = await this.prisma.chasideAssessment.create({
      data: {
        userId,
        rawAnswers: dto.answers as any,
        status: 'PENDING',
      },
    });

    // 2. Encola el job — BullMQ persiste esto en Redis
    await this.chasideQueue.add(
      'process-assessment',
      { assessmentId: assessment.id },
      {
        attempts: 3, // Reintenta 3 veces si Claude falla
        backoff: {
          type: 'exponential',
          delay: 2000, // 2s, 4s, 8s entre reintentos
        },
      },
    );

    // 3. Responde inmediatamente con 202 — el análisis se procesa en background
    return { assessmentId: assessment.id, status: 'PENDING' };
  }

  async getResults(assessmentId: string, userId: string) {
    const assessment = await this.prisma.chasideAssessment.findFirst({
      where: { id: assessmentId, userId }, // userId para que no vea resultados ajenos
    });

    if (!assessment) {
      throw new NotFoundException('Assessment no encontrado');
    }

    return assessment;
  }

  async getMyAssessments(userId: string) {
    return this.prisma.chasideAssessment.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        scores: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
