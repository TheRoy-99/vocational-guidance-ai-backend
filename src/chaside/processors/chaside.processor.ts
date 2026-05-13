import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { ChasideService, CHASIDE_QUEUE } from '../services/chaside.service';

@Processor(CHASIDE_QUEUE)
export class ChasideProcessor {
  private readonly logger = new Logger(ChasideProcessor.name);

  constructor(
    private readonly chasideService: ChasideService,
  ) {}

  @Process('process-assessment')
  async handleAssessment(job: Job<{ assessmentId: string }>) {
    const { assessmentId } = job.data;
    this.logger.log(`Procesando assessment ${assessmentId}...`);

    await this.chasideService.processAssessment(assessmentId);
    this.logger.log(`Assessment ${assessmentId} procesado exitosamente`);
  }
}
