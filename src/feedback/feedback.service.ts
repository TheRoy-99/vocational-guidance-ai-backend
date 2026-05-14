import { Injectable, Logger } from '@nestjs/common';
import { appendFile } from 'fs/promises';
import { join } from 'path';

export type FeedbackRecord = {
  userId?: string | null;
  source?: string | null;
  rating?: number | null;
  message?: string | null;
  metadata?: unknown;
  createdAt: string;
};

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);
  private readonly logPath = process.env.FEEDBACK_LOG_PATH || join(process.cwd(), 'feedback.log');

  async save(record: Omit<FeedbackRecord, 'createdAt'>) {
    const payload: FeedbackRecord = {
      ...record,
      createdAt: new Date().toISOString(),
    };

    try {
      await appendFile(this.logPath, JSON.stringify(payload) + '\n', { encoding: 'utf8' });
      this.logger.log(`Feedback registrado (${payload.source ?? 'unknown'})`);
    } catch (e) {
      this.logger.error('No fue posible escribir feedback en disco', e as any);
      throw e;
    }

    return payload;
  }
}
