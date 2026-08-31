import { Injectable, Logger } from '@nestjs/common';
import { appendFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';

export type FeedbackRecord = { userId?: string | null; source?: string | null; rating?: number | null; message?: string | null; metadata?: unknown; createdAt: string };
export type AssessmentFeedbackInput = {
  idempotencyKey: string; assessmentId?: string | null; evaluatorType: 'STUDENT_USER' | 'EVALUATOR'; questionnaireVersion: string; feedbackContext?: 'ADAPTIVE_ASSESSMENT' | 'ICFES' | 'CHASIDE' | 'PLATFORM_GENERAL'; status?: 'DRAFT' | 'SUBMITTING' | 'COMPLETED' | 'ABANDONED' | 'DISMISSED'; startedAt?: string; questionCountShown?: number; lastQuestionReached?: number;
  answers?: Array<{ questionId: string; responseType: string; responseValue?: unknown; responseText?: string; position: number }>;
  [key: string]: unknown;
};

const INTEGER_FIELDS = new Set([
  'clarityGain',
  'perceivedUtility',
  'selfPerceivedAlignment',
  'recommendationRelevance',
  'adaptiveLogicPerception',
  'preTestClarity',
  'systemResultCoherence',
  'adaptiveMethodologyPerception',
  'vocationalGuidanceConfidence',
]);

function normalizeFeedbackField(field: string, value: unknown): unknown {
  if (!INTEGER_FIELDS.has(field)) return value;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : null;
  if (typeof value !== 'string') return null;

  const normalized = value.trim();
  const numericValue = Number(normalized);
  if (Number.isFinite(numericValue)) return Math.round(numericValue);

  const letter = normalized.charAt(0).toUpperCase();
  const letterValue = 'ABCDE'.indexOf(letter) + 1;
  return letterValue > 0 ? letterValue : null;
}

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);
  private readonly logPath = process.env.FEEDBACK_LOG_PATH || join(process.cwd(), 'feedback.log');
  constructor(private readonly prisma: PrismaService) {}

  async save(record: Omit<FeedbackRecord, 'createdAt'>) {
    const payload: FeedbackRecord = { ...record, createdAt: new Date().toISOString() };
    try { await appendFile(this.logPath, JSON.stringify(payload) + '\n', { encoding: 'utf8' }); this.logger.log(`Feedback registrado (${payload.source ?? 'unknown'})`); } catch (e) { this.logger.error('No fue posible escribir feedback en disco', e as any); throw e; }
    return payload;
  }

  async saveAssessmentFeedback(userId: string, input: AssessmentFeedbackInput) {
    const existing = await this.prisma.assessmentFeedback.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
    if (input.assessmentId) {
      const assessment = await this.prisma.vocationalAssessment.findFirst({ where: { id: input.assessmentId, userId }, select: { id: true } });
      if (!assessment) input.assessmentId = null;
    }
const fields = ['clarityGain', 'perceivedUtility', 'selfPerceivedAlignment', 'discoveryEffect', 'recommendationRelevance', 'adaptiveLogicPerception', 'questionRelevance', 'actionIntent', 'preTestClarity', 'studentOutcome', 'studentPerceivedBenefits', 'systemResultCoherence', 'adaptiveMethodologyPerception', 'educationalPotential', 'vocationalGuidanceConfidence', 'openFeedback', 'disagreementReason'] as const;
    const data: Record<string, unknown> = { userId, assessmentId: input.assessmentId ?? null, evaluatorType: input.evaluatorType, feedbackContext: input.feedbackContext ?? 'PLATFORM_GENERAL', questionnaireVersion: input.questionnaireVersion, status: input.status ?? 'DRAFT', startedAt: input.startedAt ? new Date(input.startedAt) : undefined, completedAt: input.status === 'COMPLETED' ? new Date() : null, completed: input.status === 'COMPLETED', questionCountShown: input.questionCountShown ?? input.answers?.length ?? 0, lastQuestionReached: input.lastQuestionReached ?? 0, idempotencyKey: input.idempotencyKey };
    for (const field of fields) if (input[field] !== undefined) data[field] = normalizeFeedbackField(field, input[field]);
    return this.prisma.$transaction(async tx => {
      const feedback = await tx.assessmentFeedback.create({ data: data as any });
      if (input.answers?.length) await tx.assessmentFeedbackResponse.createMany({ data: input.answers.map(answer => ({ feedbackId: feedback.id, questionId: answer.questionId, responseType: answer.responseType, responseValue: answer.responseValue as any, responseText: answer.responseText, position: answer.position })) });
      await tx.assessmentFeedbackEvent.create({ data: { feedbackId: feedback.id, eventType: input.status === 'COMPLETED' ? 'feedback_completed' : 'feedback_started', position: input.lastQuestionReached ?? 0 } });
      return feedback;
    });
  }

  async addEvent(userId: string, feedbackId: string, eventType: string, position?: number) {
    const feedback = await this.prisma.assessmentFeedback.findFirst({ where: { id: feedbackId, userId }, select: { id: true } });
    if (!feedback) return null;
    if (eventType === 'feedback_abandoned') {
      await this.prisma.assessmentFeedback.update({ where: { id: feedbackId }, data: { status: 'ABANDONED', lastQuestionReached: position ?? undefined } });
    }
    return this.prisma.assessmentFeedbackEvent.create({ data: { feedbackId, eventType, position } });
  }

  async updateAssessmentFeedback(userId: string, feedbackId: string, input: Omit<AssessmentFeedbackInput, 'idempotencyKey'>) {
    const current = await this.prisma.assessmentFeedback.findFirst({ where: { id: feedbackId, userId }, select: { id: true } });
    if (!current) return null;
    const fields = ['clarityGain', 'perceivedUtility', 'selfPerceivedAlignment', 'discoveryEffect', 'recommendationRelevance', 'adaptiveLogicPerception', 'questionRelevance', 'actionIntent', 'preTestClarity', 'studentOutcome', 'studentPerceivedBenefits', 'systemResultCoherence', 'adaptiveMethodologyPerception', 'educationalPotential', 'vocationalGuidanceConfidence', 'openFeedback', 'disagreementReason'] as const;
    const data: Record<string, unknown> = { status: input.status ?? 'DRAFT', completedAt: input.status === 'COMPLETED' ? new Date() : null, completed: input.status === 'COMPLETED', questionCountShown: input.questionCountShown, lastQuestionReached: input.lastQuestionReached };
    for (const field of fields) if (input[field] !== undefined) data[field] = normalizeFeedbackField(field, input[field]);
    const answers = Array.isArray(input.answers) ? input.answers : [];
    const lastQuestionReached = typeof input.lastQuestionReached === 'number' ? input.lastQuestionReached : 0;
    return this.prisma.$transaction(async tx => {
      const feedback = await tx.assessmentFeedback.update({ where: { id: feedbackId }, data: data as any });
      for (const answer of answers) await tx.assessmentFeedbackResponse.upsert({ where: { feedbackId_questionId: { feedbackId, questionId: answer.questionId } }, create: { feedbackId, questionId: answer.questionId, responseType: answer.responseType, responseValue: answer.responseValue as any, responseText: answer.responseText, position: answer.position }, update: { responseType: answer.responseType, responseValue: answer.responseValue as any, responseText: answer.responseText, position: answer.position } });
      if (input.status === 'COMPLETED') await tx.assessmentFeedbackEvent.create({ data: { feedbackId, eventType: 'feedback_completed', position: lastQuestionReached } });
      return feedback;
    });
  }
}
