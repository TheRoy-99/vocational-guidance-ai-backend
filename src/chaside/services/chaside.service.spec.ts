import { ChasideService } from './chaside.service';
import {
  AI_RATE_LIMITED_MESSAGE,
  ChasideAiService,
} from './chaside-ai.service';
import { ChasideScoringService } from './chaside-scoring.service';
import { PrismaService } from '../../prisma/prisma.service';
import { IcfesService } from '../../icfes/icfes.service';

const USER_ID = 'user-1';
const ICFES_UPDATED_AT = new Date('2026-01-01T00:00:00.000Z');
const CONTEXT_SIGNATURE = `no-assessment|icfes-1:${ICFES_UPDATED_AT.toISOString()}|no-adaptive-assessment`;

const previousTurn = (
  role: 'user' | 'assistant',
  content: string,
  source?: string,
) => ({
  id: `${role}-${content}`,
  role,
  content,
  normalizedContent: content,
  turnKey: 'turn-0',
  cacheSourceTurnKey: null,
  metadata: source ? { source } : {},
  createdAt: new Date(),
});

describe('ChasideService.chat - decisión de usar IA', () => {
  let chatMessage: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
  let chatConversation: { findFirst: jest.Mock; update: jest.Mock };
  let aiService: { answerVocationalChat: jest.Mock; analyze: jest.Mock };
  let icfesService: { findLatest: jest.Mock };
  let service: ChasideService;

  const conversationWith = (messages: unknown[]) => ({
    id: 'conversation-1',
    contextSignature: CONTEXT_SIGNATURE,
    summary: 'resumen',
    messages,
  });

  const mockCachedCandidate = (metadata: unknown) => {
    chatMessage.findMany.mockResolvedValue([
      {
        turnKey: 'turn-1',
        content: 'x',
        normalizedContent: 'carrera estudiar',
      },
    ]);
    chatMessage.findFirst.mockResolvedValue({
      content: 'Respuesta cacheada',
      metadata,
    });
  };

  beforeEach(() => {
    chatMessage = {
      create: jest.fn().mockResolvedValue({ id: 'message-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    };
    chatConversation = {
      findFirst: jest.fn().mockResolvedValue(conversationWith([])),
      update: jest.fn().mockResolvedValue({}),
    };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ exists: true }]),
      chasideAssessment: { findMany: jest.fn().mockResolvedValue([]) },
      vocationalAssessment: { findFirst: jest.fn().mockResolvedValue(null) },
      chatConversation,
      chatMessage,
    };
    aiService = {
      answerVocationalChat: jest
        .fn()
        .mockResolvedValue({ answer: 'Respuesta IA', source: 'ai' }),
      analyze: jest.fn(),
    };
    icfesService = {
      findLatest: jest.fn().mockResolvedValue({
        id: 'icfes-1',
        updatedAt: ICFES_UPDATED_AT,
        globalScore: 350,
        globalPercentile: 90,
        subjectScores: [],
      }),
    };

    service = new ChasideService(
      prisma as unknown as PrismaService,
      {} as ChasideScoringService,
      aiService as unknown as ChasideAiService,
      icfesService as unknown as IcfesService,
    );
  });

  it('no llama a ningún proveedor de IA cuando el usuario no tiene resultados', async () => {
    icfesService.findLatest.mockResolvedValue(null);

    const result = await service.chat(USER_ID, {
      message: 'Hola, ¿qué estudio?',
    });

    expect(result.status).toBe('NO_CONTEXT');
    expect(aiService.answerVocationalChat).not.toHaveBeenCalled();
  });

  describe('caché de respuestas', () => {
    it('reutiliza una respuesta de la IA en la primera pregunta de una conversación', async () => {
      mockCachedCandidate({ source: 'ai' });

      const result = await service.chat(USER_ID, {
        message: '¿Qué carrera estudiar?',
      });

      expect(result.answer).toBe('Respuesta cacheada');
      expect(result.reusedCachedAnswer).toBe(true);
      expect(aiService.answerVocationalChat).not.toHaveBeenCalled();
    });

    it.each([
      ['el aviso de límite de IA', { source: 'rate_limited' }],
      ['la respuesta local de emergencia', { source: 'fallback' }],
      ['un mensaje antiguo sin origen registrado', {}],
    ])('no reutiliza %s', async (_label, metadata) => {
      mockCachedCandidate(metadata);

      const result = await service.chat(USER_ID, {
        message: '¿Qué carrera estudiar?',
      });

      expect(result.answer).toBe('Respuesta IA');
      expect(result.reusedCachedAnswer).toBe(false);
      expect(aiService.answerVocationalChat).toHaveBeenCalledTimes(1);
    });

    it('no confunde preguntas opuestas ("sin" / "con")', async () => {
      chatMessage.findMany.mockResolvedValue([
        {
          turnKey: 'turn-1',
          content: 'x',
          normalizedContent: 'carreras con matematicas',
        },
      ]);
      chatMessage.findFirst.mockResolvedValue({
        content: 'Respuesta cacheada',
        metadata: { source: 'ai' },
      });

      const result = await service.chat(USER_ID, {
        message: '¿Carreras sin matemáticas?',
      });

      expect(result.reusedCachedAnswer).toBe(false);
      expect(aiService.answerVocationalChat).toHaveBeenCalledTimes(1);
    });

    it('no usa la caché en una conversación en curso', async () => {
      chatConversation.findFirst.mockResolvedValue(
        conversationWith([
          previousTurn('user', '¿Qué carrera estudiar?'),
          previousTurn('assistant', 'Ingeniería Industrial.', 'ai'),
        ]),
      );
      mockCachedCandidate({ source: 'ai' });

      const result = await service.chat(USER_ID, { message: 'Explícame más' });

      expect(chatMessage.findMany).not.toHaveBeenCalled();
      expect(result.reusedCachedAnswer).toBe(false);
      expect(aiService.answerVocationalChat).toHaveBeenCalledTimes(1);
    });
  });

  describe('historial de la conversación', () => {
    it('envía a la IA los turnos previos de la conversación, sin avisos de límite', async () => {
      chatConversation.findFirst.mockResolvedValue(
        conversationWith([
          previousTurn('user', 'Pregunta 1'),
          previousTurn('assistant', AI_RATE_LIMITED_MESSAGE, 'rate_limited'),
          previousTurn('user', 'Pregunta 2'),
          previousTurn('assistant', 'Respuesta 2', 'ai'),
        ]),
      );

      await service.chat(USER_ID, { message: '¿Y comparada con la anterior?' });

      const [input] = aiService.answerVocationalChat.mock.calls[0] as [
        { recentTurns: unknown },
      ];
      expect(input.recentTurns).toEqual([
        { role: 'user', content: 'Pregunta 1' },
        { role: 'user', content: 'Pregunta 2' },
        { role: 'assistant', content: 'Respuesta 2' },
      ]);
    });

    it('limita el historial a los 8 mensajes más recientes', async () => {
      const messages = Array.from({ length: 12 }, (_, index) =>
        previousTurn(index % 2 === 0 ? 'user' : 'assistant', `m${index}`, 'ai'),
      );
      chatConversation.findFirst.mockResolvedValue(conversationWith(messages));

      await service.chat(USER_ID, { message: 'Siguiente pregunta' });

      const [input] = aiService.answerVocationalChat.mock.calls[0] as [
        { recentTurns: Array<{ content: string }> },
      ];
      expect(input.recentTurns.map((turn) => turn.content)).toEqual([
        'm4',
        'm5',
        'm6',
        'm7',
        'm8',
        'm9',
        'm10',
        'm11',
      ]);
    });

    it('guarda el origen de la respuesta en los metadatos del mensaje', async () => {
      aiService.answerVocationalChat.mockResolvedValue({
        answer: 'Respuesta local',
        source: 'fallback',
      });

      await service.chat(USER_ID, { message: '¿Qué carrera estudiar?' });

      const assistantCall = chatMessage.create.mock.calls
        .map(([args]) => args as { data: { role: string; metadata: unknown } })
        .find((args) => args.data.role === 'assistant');
      expect(assistantCall?.data.metadata).toEqual(
        expect.objectContaining({ source: 'fallback' }),
      );
    });
  });
});
