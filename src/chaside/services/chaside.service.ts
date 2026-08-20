import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SubmitAssessmentDto } from '../dto/submit-assessment.dto';
import { VocationalChatDto } from '../dto/vocational-chat.dto';
import { ChasideScoringService } from './chaside-scoring.service';
import { ChasideAiService } from './chaside-ai.service';
import { IcfesService } from '../../icfes/icfes.service';

export const CHASIDE_QUEUE = 'chaside-analysis';
const CHASIDE_CATEGORIES = new Set(['C', 'H', 'A', 'S', 'I', 'D', 'E', 'LOCATION', 'INTEREST', 'ACTIVITY', 'ACADEMIC']);

function isChasideAssessmentRawAnswers(value: unknown): value is Array<{ category?: string }> {
  return Array.isArray(value) && value.some((item) => {
    if (!item || typeof item !== 'object') return false;
    const category = (item as { category?: unknown }).category;
    return typeof category === 'string' && CHASIDE_CATEGORIES.has(category);
  });
}

type ChatMessageRecord = {
  id: string;
  role: string;
  content: string;
  normalizedContent: string;
  turnKey: string;
  cacheSourceTurnKey: string | null;
  createdAt: Date;
};

@Injectable()
export class ChasideService {
  private readonly logger = new Logger(ChasideService.name);
  private chatSchemaReady = false;
  private chatSchemaBootstrapPromise: Promise<void> | null = null;
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringService: ChasideScoringService,
    private readonly aiService: ChasideAiService,
    private readonly icfesService: IcfesService,
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
    await this.ensureChatSchema();

    const context = await this.buildChatContext(userId, dto.assessmentId);

    if (!context.currentAssessment && !context.latestIcfesAnalysis) {
      return {
        answer:
          'Aún no tengo resultados vocacionales tuyos para usar como contexto. Completa primero tu evaluación CHASIDE o sube tu PDF de ICFES para que pueda darte orientación personalizada basada en tus datos.',
        assessmentId: null,
        conversationId: null,
        status: 'NO_CONTEXT',
      };
    }

    const conversation: any = await this.resolveConversation(userId, context.contextSignature, dto.conversationId);
    const cachedTurn = await this.findSimilarCachedTurn(userId, context.contextSignature, dto.message);

    const turnKey = randomUUID();
    const normalizedContent = this.normalizeChatText(dto.message);
    const userMessageMetadata = {
      contextSignature: context.contextSignature,
      hasIcfes: Boolean(context.latestIcfesAnalysis),
      hasChaside: Boolean(context.currentAssessment),
      reusedCachedAnswer: Boolean(cachedTurn),
    };

    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        contextSignature: context.contextSignature,
        role: 'user',
        content: dto.message,
        normalizedContent,
        turnKey,
        metadata: userMessageMetadata as any,
      },
    });

    let answer: string;
    let cacheSourceTurnKey: string | null = null;

    if (cachedTurn) {
      answer = cachedTurn.answer;
      cacheSourceTurnKey = cachedTurn.turnKey;
    } else {
      answer = await this.aiService.answerVocationalChat({
        message: dto.message,

        chasideAnalysis: context.currentAssessment ?? undefined,

        icfesAnalysis: context.latestIcfesAnalysis
          ? {
              globalScore: context.latestIcfesAnalysis.globalScore,
              globalPercentile: context.latestIcfesAnalysis.globalPercentile,
              subjectScores: Array.isArray(context.latestIcfesAnalysis.subjectScores)
                ? context.latestIcfesAnalysis.subjectScores as Array<{
                    subject: string;
                    score: number;
                    percentile?: number | null;
                  }>
                : undefined,
            }
          : undefined,

        
      });
    }

    const assistantMessage = await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        contextSignature: context.contextSignature,
        role: 'assistant',
        content: answer,
        normalizedContent: this.normalizeChatText(answer),
        turnKey,
        cacheSourceTurnKey,
        metadata: {
          fromCache: Boolean(cachedTurn),
          sourceTurnKey: cacheSourceTurnKey,
          assessmentId: context.currentAssessment?.id ?? null,
          icfesId: context.latestIcfesAnalysis?.id ?? null,
        } as any,
      },
    });

    await this.prisma.chatConversation.update({
      where: { id: conversation.id },
      data: {
        summary: conversation.summary || dto.message.slice(0, 140),
      },
    });

    return {
      answer,
      assessmentId: context.currentAssessment?.id ?? null,
      conversationId: conversation.id,
      messageId: assistantMessage.id,
      reusedCachedAnswer: Boolean(cachedTurn),
      status: 'OK',
    };
  }

  async getChatHistory(userId: string) {
    await this.ensureChatSchema();

    const conversations = await this.prisma.chatConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return {
      activeConversationId: conversations[0]?.id ?? null,
      conversationCount: conversations.length,
      conversations: conversations.map((conversation) => ({
        id: conversation.id,
        contextSignature: conversation.contextSignature,
        topic: conversation.topic,
        summary: conversation.summary,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messages: conversation.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          turnKey: message.turnKey,
          cacheSourceTurnKey: message.cacheSourceTurnKey,
          createdAt: message.createdAt,
        })),
      })),
    };
  }

  private async buildChatContext(userId: string, assessmentId?: string) {
    const recentAssessments = await this.getRecentAssessments(userId);
    const explicitAssessment = assessmentId
      ? recentAssessments.find((assessment) => assessment.id === assessmentId)
      : null;

    const currentAssessment = explicitAssessment ?? recentAssessments[0] ?? null;

    if (currentAssessment && currentAssessment.status !== 'PROCESSED') {
      await this.processAssessment(currentAssessment.id);
    }

    const refreshedAssessments = await this.getRecentAssessments(userId);
    const refreshedCurrentAssessment = explicitAssessment
      ? refreshedAssessments.find((assessment) => assessment.id === explicitAssessment.id) ?? explicitAssessment
      : refreshedAssessments[0] ?? null;

    const latestIcfesAnalysis = await this.icfesService.findLatest(userId);

    return {
      currentAssessment: refreshedCurrentAssessment,
      recentAssessments: refreshedAssessments,
      latestIcfesAnalysis,
      contextSignature: this.buildContextSignature(refreshedCurrentAssessment, latestIcfesAnalysis),
    };
  }

  private async getRecentAssessments(userId: string) {
    return this.prisma.chasideAssessment.findMany({
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
  }

  private buildContextSignature(
    assessment: { id: string; updatedAt: Date | string } | null,
    icfesAnalysis: { id: string; updatedAt: Date | string } | null,
  ): string {
    const assessmentPart = assessment ? `${assessment.id}:${new Date(assessment.updatedAt).toISOString()}` : 'no-assessment';
    const icfesPart = icfesAnalysis ? `${icfesAnalysis.id}:${new Date(icfesAnalysis.updatedAt).toISOString()}` : 'no-icfes';
    return `${assessmentPart}|${icfesPart}`;
  }

  private async resolveConversation(
    userId: string,
    contextSignature: string,
    conversationId?: string,
  ) {
    if (conversationId) {
      const existing = await this.prisma.chatConversation.findFirst({
        where: { id: conversationId, userId },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });

      if (existing && existing.contextSignature === contextSignature) {
        return existing;
      }
    }

    const latest = await this.prisma.chatConversation.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (latest && latest.contextSignature === contextSignature) {
      return latest;
    }

    const created = await this.prisma.chatConversation.create({
      data: {
        userId,
        contextSignature,
        topic: 'VOCATIONAL',
      },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    return created;
  }

  private async findSimilarCachedTurn(userId: string, contextSignature: string, message: string) {
    const normalizedMessage = this.normalizeChatText(message);
    if (!normalizedMessage) {
      return null;
    }

    const candidateMessages = await this.prisma.chatMessage.findMany({
      where: {
        contextSignature,
        role: 'user',
        conversation: { userId },
      },
      orderBy: { createdAt: 'desc' },
      take: 80,
      select: {
        turnKey: true,
        content: true,
        normalizedContent: true,
      },
    });

    let bestCandidate: { turnKey: string; score: number } | null = null;

    for (const candidate of candidateMessages) {
      const score = this.compareSimilarity(normalizedMessage, candidate.normalizedContent);
      if (score >= 0.82 && (!bestCandidate || score > bestCandidate.score)) {
        bestCandidate = { turnKey: candidate.turnKey, score };
      }
    }

    if (!bestCandidate) {
      return null;
    }

    const cachedAssistant = await this.prisma.chatMessage.findFirst({
      where: {
        contextSignature,
        turnKey: bestCandidate.turnKey,
        role: 'assistant',
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!cachedAssistant) {
      return null;
    }

    return {
      turnKey: bestCandidate.turnKey,
      answer: cachedAssistant.content,
    };
  }

  private extractRecentConversationTurns(messages: ChatMessageRecord[]) {
    return messages.slice(-8).map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    }));
  }

  private normalizeChatText(value: string): string {
    const stopWords = new Set([
      'a', 'al', 'algo', 'algunas', 'algunos', 'ante', 'antes', 'como', 'con', 'contra', 'cual', 'cuales', 'de', 'del', 'desde', 'donde', 'el', 'ella', 'ellas', 'ellos', 'en', 'entre', 'es', 'esa', 'ese', 'eso', 'esta', 'este', 'esto', 'ha', 'hay', 'la', 'las', 'le', 'les', 'lo', 'los', 'me', 'mi', 'mis', 'mucho', 'muy', 'o', 'para', 'pero', 'por', 'que', 'se', 'sin', 'sobre', 'su', 'sus', 'te', 'tu', 'tus', 'un', 'una', 'unas', 'unos', 'y', 'ya', 'voy', 'puedes', 'podrias', 'podrías', 'quiero', 'quisiera', 'quieres', 'dime', 'me', 'mi', 'sobre', 'segun', 'según'
    ]);

    return value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word && !stopWords.has(word))
      .join(' ')
      .trim();
  }

  private compareSimilarity(left: string, right: string): number {
    const leftTokens = new Set(left.split(/\s+/).filter(Boolean));
    const rightTokens = new Set(right.split(/\s+/).filter(Boolean));

    if (leftTokens.size === 0 || rightTokens.size === 0) {
      return 0;
    }

    let intersection = 0;
    for (const token of leftTokens) {
      if (rightTokens.has(token)) {
        intersection += 1;
      }
    }

    const union = new Set([...leftTokens, ...rightTokens]).size;
    return intersection / union;
  }

  private async ensureChatSchema(): Promise<void> {
    if (this.chatSchemaReady) {
      return;
    }

    if (!this.chatSchemaBootstrapPromise) {
      this.chatSchemaBootstrapPromise = this.bootstrapChatSchema()
        .then(() => {
          this.chatSchemaReady = true;
        })
        .finally(() => {
          this.chatSchemaBootstrapPromise = null;
        });
    }

    await this.chatSchemaBootstrapPromise;
  }

  private async bootstrapChatSchema(): Promise<void> {
    const tableExists = await this.prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT to_regclass('public.chat_conversations') IS NOT NULL AS "exists"
    `;

    if (tableExists[0]?.exists) {
      return;
    }

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "chat_conversations" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "contextSignature" TEXT NOT NULL,
        "topic" TEXT NOT NULL DEFAULT 'VOCATIONAL',
        "summary" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,

        CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "chat_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "chat_conversations_userId_contextSignature_idx"
      ON "chat_conversations"("userId", "contextSignature");
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "chat_conversations_userId_updatedAt_idx"
      ON "chat_conversations"("userId", "updatedAt");
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "chat_messages" (
        "id" TEXT NOT NULL,
        "conversationId" TEXT NOT NULL,
        "contextSignature" TEXT NOT NULL,
        "role" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "normalizedContent" TEXT NOT NULL,
        "turnKey" TEXT NOT NULL,
        "cacheSourceTurnKey" TEXT,
        "metadata" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,

        CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "chat_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "chat_messages_conversationId_createdAt_idx"
      ON "chat_messages"("conversationId", "createdAt");
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "chat_messages_contextSignature_role_idx"
      ON "chat_messages"("contextSignature", "role");
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "chat_messages_contextSignature_normalizedContent_idx"
      ON "chat_messages"("contextSignature", "normalizedContent");
    `);
  }
}
