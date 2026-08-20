import { Injectable, Logger } from '@nestjs/common';
import Groq from 'groq-sdk';
import { ChasideScores, ContextData } from './chaside-scoring.service';
import { CHASIDE_AREAS } from '../constants/chaside-questions';

type AssessmentSnapshot = {
  id: string;
  status: string;
  rawAnswers?: unknown;
  scores?: unknown;
  contextData?: unknown;
  aiAnalysis?: string | null;
  topCareers?: unknown;
  notRecommended?: unknown;
  idealEnvironment?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

type ConversationTurn = {
  role: 'user' | 'assistant';
  content: string;
};

type IcfesAnalysisSnapshot = {
  globalScore: number;
  globalPercentile?: number | null;
  candidateName?: string | null;
  registrationNumber?: string | null;
  subjectScores?: unknown;
  strengths?: unknown;
  weaknesses?: unknown;
  recommendations?: unknown;
  summary?: string;
};

type UserProfileContext = {
  name?: string | null;
  educationLevel?: string | null;
  fieldOfStudy?: string | null;
  relevantInterests?: string[];
};

type ConversationMemory = {
  preferences?: string[];
  goals?: string[];
  importantFacts?: string[];
};

type VocationalChatInput = {
  message: string;

  // Perfil básico del estudiante
  userProfile?: UserProfileContext | null;

  // Resultado CHASIDE
  chasideAnalysis?: AssessmentSnapshot | null;

  // Otros resultados/evaluaciones disponibles
  recentAssessments?: AssessmentSnapshot[];

  // Resultado ICFES
  icfesAnalysis?: IcfesAnalysisSnapshot | null;

  // Memoria persistente del estudiante
  conversationMemory?: ConversationMemory | null;

  // Últimos mensajes de la conversación actual
  recentConversationTurns?: ConversationTurn[];
};

export interface AiAnalysisResult {
  narrativeAnalysis: string;
  topCareers: { career: string; justification: string }[];
  notRecommended: { career: string; reason: string }[];
  idealWorkEnvironment: string;
  topAreas: string[]; // Las 2 áreas principales
}

@Injectable()
export class ChasideAiService {
  private readonly client: Groq;
  private readonly logger = new Logger(ChasideAiService.name);

  constructor() {
  this.logger.log(
    `GROQ_API_KEY configurada: ${!!process.env.GROQ_API_KEY}`,
  );

  this.client = new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });
}

  async analyze(scores: ChasideScores, contextData: ContextData): Promise<AiAnalysisResult> {
    this.logger.log('Llamando a Groq API para análisis CHASIDE...');
    
    // Identifica las 2 áreas principales
    const rankedAreas = this.getTopAreas(scores);
    const topTwo = rankedAreas.slice(0, 2);
    
    try {
      this.logger.log('ANTES DE LLAMAR A GROQ');

    const response = await this.client.chat.completions.create({
      model: 'groq/compound-mini',
      max_completion_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: this.buildPrompt(scores, topTwo, contextData),
        },
      ],
    });

    this.logger.log('RESPUESTA RECIBIDA DE GROQ');

    const rawText = response.choices[0]?.message?.content;

    if (!rawText) {
      throw new Error('Groq devolvió una respuesta vacía');
    }

    this.logger.log(`Longitud de respuesta Groq: ${rawText.length}`);
      const parsed = this.parseResponse(rawText);
      return {
        ...parsed,
        topAreas: topTwo.map((a) => (CHASIDE_AREAS as any)[a].name),
      };
    } catch (error) {
      this.logger.error(
        'ERROR COMPLETO DE GROQ:',
        error instanceof Error ? error.stack : JSON.stringify(error),
      );

      return this.buildFallbackAnalysis(scores, topTwo, contextData);
    }
  }

  async answerVocationalChat(input: VocationalChatInput): Promise<string> {
    const context = this.buildChatContext(input);

    try {
      this.logger.debug(
      `VOCATIONAL CHAT CONTEXT:\n${JSON.stringify(context, null, 2)}`
    );
      const response = await this.client.chat.completions.create({
        
        model: 'groq/compound-mini',
        temperature: 0.6,
        max_completion_tokens: 500,
        messages: [
          {
            role: 'system',
            content: this.buildChatSystemPrompt(),
          },
          {
            role: 'user',
            content: this.buildChatPrompt(
              input.message,
              context,
            ),
          },
        ],
        
      });

      const answer = response.choices[0].message.content?.trim();
      if (!answer) {
        throw new Error('Groq returned an empty response');
      }

      return answer;
    } catch (error) {
      this.logger.warn(
        `Groq falló en el chat vocacional. Se usará respuesta local. Error: ${String(error)}`,
      );
      return this.buildChatFallback(input.message, context);
    }
  }

  private getTopAreas(scores: ChasideScores): string[] {
    return Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => key);
  }

  private buildPrompt(scores: ChasideScores, topTwo: string[], contextData: ContextData): string {
    const areaInfo = topTwo
      .map((area) => {
        const areaData = (CHASIDE_AREAS as any)[area];
        return `
**${areaData.name}**
- Descripción: ${areaData.description}
- Características: ${areaData.characteristics.join(', ')}
- Carreras típicas: ${areaData.careerExamples.join(', ')}`;
      })
      .join('\n');

    return `
Eres un orientador vocacional experto en el test CHASIDE. Analiza este perfil vocacional de manera COHERENTE.

## Resultado del Test CHASIDE

El estudiante tiene dos áreas principales:

${areaInfo}

Scores completos:
- C: ${scores.C}, H: ${scores.H}, A: ${scores.A}, S: ${scores.S}, I: ${scores.I}, D: ${scores.D}, E: ${scores.E}

## Instrucciones:

1. **Análisis narrativo**: Explica por qué estas 2 áreas definen su perfil. Sé específico. No es un análisis general.
2. **Carreras recomendadas**: Selecciona SOLO carreras que encajen CLARAMENTE con esas 2 áreas. NO contradictorio.
3. **Carreras no recomendadas**: Carreras muy lejanas a su perfil (máximo 2).
4. **Ambiente ideal**: Describe dónde trabajaría mejor considerando esas 2 áreas.

IMPORTANTE: Sé consistente. Si recomiendas una carrera como "Contador", no la liste también como "no recomendada". 

Responde ÚNICAMENTE con JSON válido (sin markdown, sin backticks):

{
  "narrativeAnalysis": "3-4 párrafos explicando coherentemente por qué estas 2 áreas caracterizan su perfil vocacional.",
  "topCareers": [
    { "career": "carrera1", "justification": "por qué encaja específicamente con ${topTwo[0]} y ${topTwo[1]}" },
    { "career": "carrera2", "justification": "por qué encaja específicamente con ${topTwo[0]} y/o ${topTwo[1]}" },
    { "career": "carrera3", "justification": "por qué encaja específicamente con su perfil" },
    { "career": "carrera4", "justification": "por qué encaja específicamente con su perfil" },
    { "career": "carrera5", "justification": "por qué encaja específicamente con su perfil" }
  ],
  "notRecommended": [
    { "career": "carrera opuesta", "reason": "por qué NO encaja con ${topTwo[0]} y ${topTwo[1]}" },
    { "career": "carrera opuesta", "reason": "por qué NO encaja con su perfil" }
  ],
  "idealWorkEnvironment": "descripción del ambiente ideal donde rendiría mejor"
}
    `.trim();
  }

  private parseResponse(raw: string): Omit<AiAnalysisResult, 'topAreas'> {
    try {
      const clean = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch (error) {
      this.logger.error('Error parseando JSON de Groq', error);
      throw new Error('Respuesta de Groq no es JSON válido');
    }
  }

  private buildFallbackAnalysis(
    scores: ChasideScores,
    topTwo: string[],
    contextData: ContextData,
  ): AiAnalysisResult {
    const firstArea = topTwo[0] as keyof typeof CHASIDE_AREAS;
    const secondArea = topTwo[1] as keyof typeof CHASIDE_AREAS;

    const firstAreaData = CHASIDE_AREAS[firstArea];
    const secondAreaData = CHASIDE_AREAS[secondArea];

    // Combina carreras de las 2 áreas principales
    const combinedCareers = [
      ...firstAreaData.careerExamples,
      ...secondAreaData.careerExamples,
    ];

    // Selecciona las 5 primeras
    const topCareers = combinedCareers.slice(0, 5).map((career) => ({
      career,
      justification: `Encaja con tu perfil en ${firstAreaData.name} y ${secondAreaData.name}.`,
    }));

    // Identifica áreas débiles para "no recomendadas"
    const allAreas = Object.keys(CHASIDE_AREAS) as Array<
      keyof typeof CHASIDE_AREAS
    >;
    const weakAreas = allAreas
      .filter((area) => !topTwo.includes(area))
      .sort(
        (a, b) =>
          scores[a as keyof ChasideScores] -
          scores[b as keyof ChasideScores],
      )
      .slice(0, 2);

    const notRecommended = weakAreas.map((area) => {
      const areaData = CHASIDE_AREAS[area];
      return {
        career: areaData.careerExamples[0] || 'Área no alineada',
        reason: `Tu puntaje en ${areaData.name} es bajo. Carreras de esta área podrían ser desafiantes para ti.`,
      };
    });

    return {
      narrativeAnalysis: `Tu perfil CHASIDE se caracteriza principalmente por: ${firstAreaData.name} (${scores[firstArea as keyof ChasideScores]}) y ${secondAreaData.name} (${scores[secondArea as keyof ChasideScores]}). Esto significa que tienes aptitudes naturales en ${firstAreaData.description.toLowerCase()} y ${secondAreaData.description.toLowerCase()}. Te recomendamos explorar carreras que combinen ambas fortalezas, donde puedas aplicar tu mejor forma de pensar y trabajar.`,
      topCareers:
        topCareers.length > 0
          ? topCareers
          : [
              {
                career: 'Explorar carreras híbridas',
                justification: 'Que combinen tus dos áreas principales',
              },
            ],
      notRecommended:
        notRecommended.length > 0
          ? notRecommended
          : [
              {
                career: 'Área distante',
                reason: 'Muy lejana a tu perfil actual',
              },
            ],
      idealWorkEnvironment: `Ambientes donde puedas ${firstAreaData.characteristics
        .slice(0, 2)
        .join(' y ')
        .toLowerCase()} en contextos que requieran ${secondAreaData.characteristics
        .slice(0, 2)
        .join(' y ')
        .toLowerCase()}.`,
      topAreas: [firstAreaData.name, secondAreaData.name],
    };
  }

  private buildChatSystemPrompt(): string {
  return [
    'Eres OrientaAI, un asistente de orientación vocacional juvenil, claro y conversacional.',
    
    'Tu objetivo es ayudar al estudiante a tomar mejores decisiones sobre carreras, estudios, habilidades, fortalezas, áreas de interés, rutas formativas y empleabilidad.',

    'Tienes acceso a dos tipos de evaluaciones:',
    '1. CHASIDE: identifica intereses y aptitudes en 7 áreas vocacionales.',
    '2. ICFES: contiene puntajes, percentiles y desempeño por asignatura.',

    'Usa los resultados del estudiante como contexto principal y nunca inventes datos personales, académicos o psicológicos.',

    'ESTILO DE RESPUESTA:',
    'Responde como una conversación, no como un informe académico.',
    'Sé directo, natural y fácil de leer.',
    'Prioriza calidad sobre cantidad.',
    'Normalmente responde entre 60 y 120 palabras.',
    'Si la pregunta es muy sencilla, responde incluso con menos de 60 palabras.',
    'Solo desarrolla respuestas más largas cuando la pregunta realmente lo requiera.',
    'No repitas todo el perfil del estudiante en cada respuesta.',
    'No vuelvas a explicar resultados que ya fueron explicados anteriormente salvo que sean relevantes para la pregunta actual.',

    'FORMATO:',
    'Usa Markdown para hacer la respuesta visualmente fácil de leer.',
    'Utiliza párrafos cortos.',
    'Usa listas con viñetas cuando tengas 2 o más elementos.',
    'Usa negrita para destacar conceptos importantes, pero sin abusar.',
    'Puedes utilizar emojis ocasionalmente cuando aporten naturalidad, por ejemplo 🎯, 💡, 🚀 o 📚.',
    'No uses emojis en cada párrafo.',
    'Evita tablas salvo que el usuario pida explícitamente una comparación estructurada.',
    'Evita encabezados innecesarios.',
    'No escribas introducciones largas.',

    'CONVERSACIÓN:',
    'Responde directamente a la pregunta actual.',
    'No hagas un resumen completo del perfil si el usuario solo pregunta por una carrera concreta.',
    'Cuando sea útil, termina con UNA sugerencia breve de qué podría preguntar o explorar después.',
    'No hagas una pregunta de seguimiento en todas las respuestas.',
    'Aproximadamente una de cada tres respuestas puede terminar con una sugerencia de siguiente paso.',

    'EJEMPLO DEL ESTILO:',
    'En lugar de escribir un informe largo sobre Ingeniería de Sistemas, responde de forma breve y concreta.',
    'Ejemplo:',
    '“🎯 Ingeniería de Sistemas encaja muy bien con tu perfil porque combina tu fortaleza en análisis (80) con tu pensamiento lógico (60).',
    'Además, tu buen desempeño en Matemáticas e Inglés puede ayudarte bastante durante la carrera.',
    'Si te interesa, también podemos comparar Sistemas vs. Ciencia de Datos para ver cuál encaja mejor contigo.”',

    'RESTRICCIONES:',
    'Responde únicamente sobre orientación vocacional.',
    'Si la pregunta no pertenece al ámbito vocacional, indícalo brevemente y redirígela hacia una cuestión relacionada con estudios o carrera.',
    'Responde siempre en español.',
  ].join(' ');
}

  
  private buildChatPrompt(
    message: string,
    context: Record<string, unknown>,
  ): string {
    return `
  Contexto del estudiante:
  ${JSON.stringify(context, null, 2)}

  Pregunta actual:
  ${message}

  Instrucciones para esta respuesta:

  - Responde directamente a la pregunta.
  - No repitas información que no sea necesaria.
  - Prioriza los datos del estudiante relevantes para esta pregunta.
  - Mantén la respuesta normalmente entre 60 y 120 palabras.
  - Si la pregunta puede responderse en pocas frases, hazlo así.
  - Usa párrafos cortos y listas con viñetas cuando ayuden a organizar la información.
  - Usa **negrita** solo para conceptos realmente importantes.
  - Puedes usar 1 o 2 emojis ocasionalmente si hacen la respuesta más natural.
  - Evita tablas salvo que sean realmente necesarias.
  - No conviertas la respuesta en un informe.
  - No hagas una conclusión larga.
  - Solo recomienda una siguiente pregunta o tema para explorar cuando aporte valor; no lo hagas siempre.
  - No inventes información que no aparezca en el contexto.
  - Responde en español.
  `.trim();
  }

  private buildChatFallback(
    message: string,
    context: Record<string, unknown>,
  ): string {
    const chaside = context.chaside as Record<string, unknown> | undefined;

    const topCareers = Array.isArray(chaside?.topCareers)
      ? (chaside.topCareers as Array<{ career?: string }>)
          .map((item) => item.career)
          .filter((career): career is string => Boolean(career))
          .slice(0, 3)
      : [];

    const icfes = context.icfes as Record<string, unknown> | undefined;

    const user = context.user as Record<string, unknown> | undefined;

    const userName =
      typeof user?.name === 'string' ? user.name : '';

    const careersText =
      topCareers.length > 0
        ? topCareers.join(', ')
        : 'las opciones que mejor encajen con tu perfil';

    const icfesText =
      typeof icfes?.globalScore === 'number'
        ? `Tu puntaje global del ICFES es ${icfes.globalScore}.`
        : '';

    const greeting = userName
      ? `Hola, ${userName}.`
      : 'Hola.';

    return [
      greeting,
      'Puedo ayudarte con orientación vocacional.',
      `Según los resultados disponibles, puedes explorar ${careersText}.`,
      icfesText,
      'También puedo ayudarte a comparar carreras, analizar tus fortalezas o relacionar tus resultados con una posible carrera.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private buildChatContext(
  input: VocationalChatInput,
): Record<string, unknown> {
  const context: Record<string, unknown> = {};

  // =====================================================
  // PERFIL DEL ESTUDIANTE
  // =====================================================

  if (input.userProfile) {
    context.user = {
      name: input.userProfile.name,
      educationLevel: input.userProfile.educationLevel,
      fieldOfStudy: input.userProfile.fieldOfStudy,
      relevantInterests: input.userProfile.relevantInterests,
    };
  }

  // =====================================================
  // RESULTADO CHASIDE
  // =====================================================

  if (input.chasideAnalysis) {
    context.chaside = {
      contextData: input.chasideAnalysis.contextData,
      scores: input.chasideAnalysis.scores,
      topCareers: input.chasideAnalysis.topCareers,
      notRecommended: input.chasideAnalysis.notRecommended,
      idealEnvironment: input.chasideAnalysis.idealEnvironment,
      aiAnalysis: input.chasideAnalysis.aiAnalysis,
    };
  }

  // =====================================================
  // RESULTADO ICFES
  // =====================================================

  if (input.icfesAnalysis) {
    context.icfes = {
      globalScore: input.icfesAnalysis.globalScore,
      globalPercentile: input.icfesAnalysis.globalPercentile,
      subjectScores: input.icfesAnalysis.subjectScores,
      strengths: input.icfesAnalysis.strengths,
      weaknesses: input.icfesAnalysis.weaknesses,
      recommendations: input.icfesAnalysis.recommendations,
      summary: input.icfesAnalysis.summary,
    };
  }

  // =====================================================
  // OTROS RESULTADOS / EVALUACIONES
  // =====================================================

  if (input.recentAssessments?.length) {
    context.otherAssessments = input.recentAssessments.map(
      (assessment) => ({
        status: assessment.status,
        scores: assessment.scores,
        contextData: assessment.contextData,
        aiAnalysis: assessment.aiAnalysis,
        topCareers: assessment.topCareers,
        notRecommended: assessment.notRecommended,
        idealEnvironment: assessment.idealEnvironment,
      }),
    );
  }

  // =====================================================
  // MEMORIA DEL ESTUDIANTE
  // =====================================================

  if (input.conversationMemory) {
    context.memory = {
      preferences: input.conversationMemory.preferences,
      goals: input.conversationMemory.goals,
      importantFacts: input.conversationMemory.importantFacts,
    };
  }

  // =====================================================
  // CONVERSACIÓN RECIENTE
  // =====================================================

  if (input.recentConversationTurns?.length) {
    context.recentConversation = input.recentConversationTurns
      .slice(-6)
      .map((turn) => ({
        role: turn.role,
        content: turn.content.slice(0, 1000),
      }));
  }

  return context;
}
  private serializeAssessment(assessment: AssessmentSnapshot): Record<string, unknown> {
    return {
      id: assessment.id,
      status: assessment.status,
      rawAnswers: assessment.rawAnswers,
      scores: assessment.scores,
      contextData: assessment.contextData,
      aiAnalysis: assessment.aiAnalysis,
      topCareers: assessment.topCareers,
      notRecommended: assessment.notRecommended,
      idealEnvironment: assessment.idealEnvironment,
      createdAt: assessment.createdAt,
      updatedAt: assessment.updatedAt,
    };
  }
}