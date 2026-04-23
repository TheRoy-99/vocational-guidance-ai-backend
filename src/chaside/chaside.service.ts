import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { INTERESTS_GRID, APTITUDES_GRID } from './constants/chaside-data';

@Injectable()
export class ChasideService {
  constructor(private prisma: PrismaService) {}

  async processAssessment(userId: string, responses: Record<string, number>) {
    try {
      const scores = this.calculateScores(responses);

      return await this.prisma.chasideAssessment.create({
        data: {
          userId,
          rawAnswers: responses as any,
          scores: scores as any,
          status: 'PENDING',
        },
      });
    } catch (error) {
      console.error('Error en ChasideService:', error);
      throw new InternalServerErrorException('No se pudo procesar el test.');
    }
  }

  private calculateScores(responses: Record<string, number>) {
    const areas = ['C', 'H', 'A', 'S', 'I', 'D', 'E'];
    const results = { interests: {}, aptitudes: {} };

    areas.forEach((area) => {
      results.interests[area] = INTERESTS_GRID[area].reduce(
        (sum, q) => sum + (responses[q] || 0),
        0,
      );
      results.aptitudes[area] = APTITUDES_GRID[area].reduce(
        (sum, q) => sum + (responses[q] || 0),
        0,
      );
    });

    return results;
  }
}
