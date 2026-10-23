import { Logger } from '@nestjs/common';
import {
  AI_RATE_LIMITED_MESSAGE,
  ChasideAiService,
} from './chaside-ai.service';
import { ChasideScores, ContextData } from './chaside-scoring.service';

// Ningún test llama a Gemini ni a Groq: ambos SDK se sustituyen por mocks.
const mockGeminiCreate = jest.fn();
const mockGroqCreate = jest.fn();
const mockOpenAiCtor = jest.fn();
const mockGroqCtor = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((options: unknown) => {
    mockOpenAiCtor(options);
    return { chat: { completions: { create: mockGeminiCreate } } };
  }),
}));

jest.mock('groq-sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((options: unknown) => {
    mockGroqCtor(options);
    return { chat: { completions: { create: mockGroqCreate } } };
  }),
}));

const GEMINI_KEY = 'gemini-test-key-SECRET-123';
const GROQ_KEY = 'gsk-test-key-SECRET-456';
const USER_MESSAGE = '¿Qué carrera me recomiendas? dato-sensible-789';
const USER_NAME = 'Estudiante Confidencial';

const completion = (content: string | null) => ({
  choices: [{ message: { content } }],
});

const httpError = (status: number) =>
  Object.assign(new Error(`${status} provider error`), { status });

const chatInput = {
  message: USER_MESSAGE,
  userProfile: { name: USER_NAME },
  icfesAnalysis: { globalScore: 350 },
};

const scores: ChasideScores = { C: 10, H: 3, A: 2, S: 8, I: 4, D: 1, E: 5 };
const contextData = {} as ContextData;

const aiAnalysisJson = JSON.stringify({
  narrativeAnalysis: 'Análisis IA',
  topCareers: [{ career: 'Contaduría', justification: 'x' }],
  notRecommended: [],
  idealWorkEnvironment: 'Oficina',
});

describe('ChasideAiService - fallback Gemini → Groq', () => {
  const originalEnv = process.env;
  let logSpies: jest.SpyInstance[];

  const createService = () => new ChasideAiService();

  const loggedText = () =>
    logSpies
      .flatMap((spy) => spy.mock.calls.flat() as unknown[])
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join('\n');

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      GEMINI_API_KEY: GEMINI_KEY,
      GROQ_API_KEY: GROQ_KEY,
    };
    delete process.env.GEMINI_MODEL;
    delete process.env.GROQ_MODEL;
    logSpies = (['log', 'warn', 'error', 'debug'] as const).map((method) =>
      jest.spyOn(Logger.prototype, method).mockImplementation(() => undefined),
    );
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('chat vocacional', () => {
    it('usa Gemini y no llama a Groq cuando Gemini responde correctamente', async () => {
      mockGeminiCreate.mockResolvedValue(completion('  Respuesta Gemini  '));

      const { answer, source } =
        await createService().answerVocationalChat(chatInput);

      expect(answer).toBe('Respuesta Gemini');
      expect(source).toBe('ai');
      expect(mockGeminiCreate).toHaveBeenCalledTimes(1);
      expect(mockGeminiCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-3.8-flash',
          max_tokens: 500,
          temperature: 0.2,
          reasoning_effort: 'none',
        }),
      );
      expect(mockGroqCreate).not.toHaveBeenCalled();
    });

    it('aplica los cuatro pilares de blindaje en el prompt y encapsula los datos', async () => {
      mockGeminiCreate.mockResolvedValue(completion('Respuesta segura'));

      await createService().answerVocationalChat(chatInput);

      const [request] = mockGeminiCreate.mock.calls[0] as [
        { messages: Array<{ role: string; content: string }> },
      ];
      const systemPrompt = request.messages[0].content;
      const userPrompt = request.messages.at(-1)?.content ?? '';

      expect(systemPrompt).toContain('FIDELIDAD NUMÉRICA');
      expect(systemPrompt).toContain('ANCLAJE A LA EVIDENCIA');
      expect(systemPrompt).toContain('CONFIDENCIALIDAD');
      expect(systemPrompt).toContain('FRONTERA DE ROL');
      expect(userPrompt).toContain('<verified_student_data>');
      expect(userPrompt).toContain('</verified_student_data>');
      expect(userPrompt).toContain('<user_query>');
      expect(userPrompt).toContain('</user_query>');
    });

    it('rechaza una respuesta generativa que altera un puntaje verificado', async () => {
      mockGeminiCreate.mockResolvedValue(completion('Tu puntaje global fue 342/500.'));

      const result = await createService().answerVocationalChat(chatInput);

      expect(result.source).toBe('fallback');
      expect(result.answer).not.toContain('342');
    });

    it('envía los turnos previos entre el prompt de sistema y la pregunta actual', async () => {
      mockGeminiCreate.mockResolvedValue(completion('ok'));
      const recentTurns = [
        { role: 'user' as const, content: '¿Qué tal Ingeniería Industrial?' },
        { role: 'assistant' as const, content: 'Encaja con tu perfil.' },
      ];

      await createService().answerVocationalChat({ ...chatInput, recentTurns });

      const [request] = mockGeminiCreate.mock.calls[0] as [
        { messages: Array<{ role: string; content: string }> },
      ];
      expect(request.messages.map((message) => message.role)).toEqual([
        'system',
        'user',
        'assistant',
        'user',
      ]);
      expect(request.messages.slice(1, 3)).toEqual(recentTurns);
      expect(request.messages[3].content).toContain(USER_MESSAGE);
    });

    it('usa Groq con el mismo prompt cuando Gemini responde HTTP 429', async () => {
      mockGeminiCreate.mockRejectedValue(httpError(429));
      mockGroqCreate.mockResolvedValue(completion('Respuesta Groq'));

      const { answer, source } =
        await createService().answerVocationalChat(chatInput);

      expect(answer).toBe('Respuesta Groq');
      expect(source).toBe('ai');
      expect(mockGeminiCreate).toHaveBeenCalledTimes(1);
      expect(mockGroqCreate).toHaveBeenCalledTimes(1);
      const [geminiRequest] = mockGeminiCreate.mock.calls[0] as [
        { messages: unknown },
      ];
      const geminiMessages = geminiRequest.messages;
      expect(mockGroqCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'openai/gpt-oss-20b',
          max_completion_tokens: 500,
          temperature: 0.2,
          reasoning_effort: 'low',
          messages: geminiMessages,
        }),
      );
    });

    it('devuelve la respuesta predefinida cuando Gemini y Groq responden HTTP 429, sin más llamadas', async () => {
      mockGeminiCreate.mockRejectedValue(httpError(429));
      mockGroqCreate.mockRejectedValue(httpError(429));

      const { answer, source } =
        await createService().answerVocationalChat(chatInput);

      expect(answer).toBe(AI_RATE_LIMITED_MESSAGE);
      expect(source).toBe('rate_limited');
      expect(mockGeminiCreate).toHaveBeenCalledTimes(1);
      expect(mockGroqCreate).toHaveBeenCalledTimes(1);
      expect(answer).not.toMatch(/gemini|groq|429/i);
    });

    it.each([400, 401, 403, 500, 503])(
      'usa Groq cuando Gemini responde HTTP %i',
      async (status) => {
        mockGeminiCreate.mockRejectedValue(httpError(status));
        mockGroqCreate.mockResolvedValue(completion('Respuesta Groq'));

        const { answer, source } =
          await createService().answerVocationalChat(chatInput);

        expect(answer).toBe('Respuesta Groq');
        expect(source).toBe('ai');
        expect(mockGeminiCreate).toHaveBeenCalledTimes(1);
        expect(mockGroqCreate).toHaveBeenCalledTimes(1);
      },
    );

    it('registra como error los 4xx de Gemini (configuración) y como aviso los 5xx', async () => {
      mockGroqCreate.mockResolvedValue(completion('Respuesta Groq'));
      const [, warnSpy, errorSpy] = logSpies;

      mockGeminiCreate.mockRejectedValueOnce(httpError(403));
      await createService().answerVocationalChat(chatInput);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('HTTP 403'),
      );

      mockGeminiCreate.mockRejectedValueOnce(httpError(503));
      await createService().answerVocationalChat(chatInput);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('HTTP 503'));
    });

    it('usa Groq ante errores sin status HTTP (timeout, red)', async () => {
      mockGeminiCreate.mockRejectedValue(new Error('Request timed out.'));
      mockGroqCreate.mockResolvedValue(completion('Respuesta Groq'));

      const { answer, source } =
        await createService().answerVocationalChat(chatInput);

      expect(answer).toBe('Respuesta Groq');
      expect(source).toBe('ai');
      expect(mockGeminiCreate).toHaveBeenCalledTimes(1);
      expect(mockGroqCreate).toHaveBeenCalledTimes(1);
    });

    it('usa Groq cuando Gemini devuelve una respuesta vacía', async () => {
      mockGeminiCreate.mockResolvedValue(completion('   '));
      mockGroqCreate.mockResolvedValue(completion('Respuesta Groq'));

      const { answer, source } =
        await createService().answerVocationalChat(chatInput);

      expect(answer).toBe('Respuesta Groq');
      expect(source).toBe('ai');
      expect(mockGroqCreate).toHaveBeenCalledTimes(1);
    });

    it('devuelve la respuesta predefinida cuando Gemini responde 503 y Groq 429', async () => {
      mockGeminiCreate.mockRejectedValue(httpError(503));
      mockGroqCreate.mockRejectedValue(httpError(429));

      const { answer, source } =
        await createService().answerVocationalChat(chatInput);

      expect(answer).toBe(AI_RATE_LIMITED_MESSAGE);
      expect(source).toBe('rate_limited');
      expect(mockGroqCreate).toHaveBeenCalledTimes(1);
    });

    it('usa la respuesta local si Groq falla con un error distinto de 429 tras el fallback', async () => {
      mockGeminiCreate.mockRejectedValue(httpError(429));
      mockGroqCreate.mockRejectedValue(httpError(401));

      const { answer, source } =
        await createService().answerVocationalChat(chatInput);

      expect(mockGeminiCreate).toHaveBeenCalledTimes(1);
      expect(mockGroqCreate).toHaveBeenCalledTimes(1);
      expect(answer).toContain('Puedo ayudarte con orientación vocacional.');
      expect(source).toBe('fallback');
    });

    it('usa Groq si falta GEMINI_API_KEY, sin enviar OPENAI_API_KEY a Google', async () => {
      delete process.env.GEMINI_API_KEY;
      process.env.OPENAI_API_KEY = 'openai-key-que-no-debe-usarse';
      mockGroqCreate.mockResolvedValue(completion('Respuesta Groq'));

      const { answer, source } =
        await createService().answerVocationalChat(chatInput);

      expect(mockOpenAiCtor).not.toHaveBeenCalled();
      expect(mockGeminiCreate).not.toHaveBeenCalled();
      expect(answer).toBe('Respuesta Groq');
      expect(source).toBe('ai');
    });

    it('arranca sin GROQ_API_KEY y usa la respuesta local si Gemini falla', async () => {
      delete process.env.GROQ_API_KEY;
      mockGeminiCreate.mockRejectedValue(httpError(503));

      const { answer, source } =
        await createService().answerVocationalChat(chatInput);

      expect(mockGroqCtor).not.toHaveBeenCalled();
      expect(mockGroqCreate).not.toHaveBeenCalled();
      expect(answer).toContain('Puedo ayudarte con orientación vocacional.');
      expect(source).toBe('fallback');
    });

    it('permite configurar el modelo de Groq solo desde el entorno', async () => {
      process.env.GROQ_MODEL = 'groq-modelo-configurado';
      mockGeminiCreate.mockRejectedValue(httpError(503));
      mockGroqCreate.mockResolvedValue(completion('ok'));

      await createService().answerVocationalChat(chatInput);

      expect(mockGroqCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'groq-modelo-configurado' }),
      );
    });

    it('permite configurar el modelo de Gemini solo desde el entorno', async () => {
      process.env.GEMINI_MODEL = 'gemini-modelo-configurado';
      mockGeminiCreate.mockResolvedValue(completion('ok'));

      await createService().answerVocationalChat(chatInput);

      expect(mockGeminiCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-modelo-configurado' }),
      );
    });
  });

  describe('análisis CHASIDE', () => {
    it('usa Gemini y no llama a Groq cuando Gemini responde correctamente', async () => {
      mockGeminiCreate.mockResolvedValue(completion(aiAnalysisJson));

      const result = await createService().analyze(scores, contextData);

      expect(result.narrativeAnalysis).toBe('Análisis IA');
      expect(mockGeminiCreate).toHaveBeenCalledTimes(1);
      expect(mockGeminiCreate).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 2048 }),
      );
      expect(mockGroqCreate).not.toHaveBeenCalled();
    });

    it('usa Groq cuando Gemini responde HTTP 503', async () => {
      mockGeminiCreate.mockRejectedValue(httpError(503));
      mockGroqCreate.mockResolvedValue(completion(aiAnalysisJson));

      const result = await createService().analyze(scores, contextData);

      expect(result.narrativeAnalysis).toBe('Análisis IA');
      expect(mockGeminiCreate).toHaveBeenCalledTimes(1);
      expect(mockGroqCreate).toHaveBeenCalledTimes(1);
      expect(mockGroqCreate).toHaveBeenCalledWith(
        expect.objectContaining({ max_completion_tokens: 2048 }),
      );
    });

    it('devuelve el análisis local predefinido cuando ambos proveedores responden HTTP 429', async () => {
      mockGeminiCreate.mockRejectedValue(httpError(429));
      mockGroqCreate.mockRejectedValue(httpError(429));

      const result = await createService().analyze(scores, contextData);

      expect(mockGeminiCreate).toHaveBeenCalledTimes(1);
      expect(mockGroqCreate).toHaveBeenCalledTimes(1);
      expect(result.topAreas).toHaveLength(2);
      expect(result.narrativeAnalysis).toContain('Tus resultados muestran');
    });

    it('no activa Groq cuando Gemini devuelve JSON inválido', async () => {
      mockGeminiCreate.mockResolvedValue(completion('no es json'));

      const result = await createService().analyze(scores, contextData);

      expect(mockGroqCreate).not.toHaveBeenCalled();
      expect(result.narrativeAnalysis).toContain('Tus resultados muestran');
    });
  });

  describe('reintentos y llamadas duplicadas', () => {
    it('crea ambos clientes sin reintentos automáticos y con timeout', () => {
      createService();

      expect(mockOpenAiCtor).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: GEMINI_KEY,
          baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
          maxRetries: 0,
          timeout: 30_000,
        }),
      );
      expect(mockGroqCtor).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: GROQ_KEY,
          maxRetries: 0,
          timeout: 30_000,
        }),
      );
    });

    it('cada solicitud llama a cada proveedor como máximo una vez aunque se repitan los 429', async () => {
      mockGeminiCreate.mockRejectedValue(httpError(429));
      mockGroqCreate.mockRejectedValue(httpError(429));
      const service = createService();

      await service.answerVocationalChat(chatInput);
      await service.answerVocationalChat(chatInput);

      expect(mockGeminiCreate).toHaveBeenCalledTimes(2);
      expect(mockGroqCreate).toHaveBeenCalledTimes(2);
    });
  });

  describe('seguridad', () => {
    it('no registra API keys, mensajes del usuario ni datos personales en ningún escenario', async () => {
      const service = createService();

      mockGeminiCreate.mockResolvedValueOnce(completion('Respuesta privada'));
      await service.answerVocationalChat(chatInput);

      mockGeminiCreate.mockRejectedValueOnce(httpError(429));
      mockGroqCreate.mockResolvedValueOnce(completion('Respuesta privada'));
      await service.answerVocationalChat(chatInput);

      mockGeminiCreate.mockRejectedValueOnce(httpError(429));
      mockGroqCreate.mockRejectedValueOnce(httpError(429));
      await service.answerVocationalChat(chatInput);

      mockGeminiCreate.mockRejectedValueOnce(
        Object.assign(new Error(`401 invalid key ${GEMINI_KEY}`), {
          status: 401,
        }),
      );
      await service.answerVocationalChat(chatInput);

      mockGeminiCreate.mockResolvedValueOnce(completion('no es json'));
      await service.analyze(scores, contextData);

      const logs = loggedText();
      expect(logs).toContain(
        'Gemini falló: Error (HTTP 429). Fallback a Groq.',
      );
      for (const secret of [
        GEMINI_KEY,
        GROQ_KEY,
        USER_MESSAGE,
        USER_NAME,
        'Respuesta privada',
        'Authorization',
      ]) {
        expect(logs).not.toContain(secret);
      }
    });
  });
});
