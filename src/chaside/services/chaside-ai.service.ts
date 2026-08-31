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

type ChatChasideContext = {
  scores: Record<string, number>;
  primaryAreas: string[];
  profileSummary?: string;
  careerInterests?: string[];
};


type IcfesAnalysisSnapshot = {
  globalScore: number;
  globalPercentile?: number | null;
  subjectScores?: Array<{
    subject: string;
    score: number;
    percentile?: number | null;
  }>;
};

type UserProfileContext = {
  name?: string | null;
  educationLevel?: string | null;
  fieldOfStudy?: string | null;
  relevantInterests?: string[];
};

type ConversationMemory = {
  interests?: string[];
  preferences?: string[];
  goals?: string[];
  importantFacts?: string[];
  discussedCareers?: string[];
  currentTopics?: string[];
};

type VocationalChatInput = {
  message: string;

  userProfile?: UserProfileContext | null;

  chasideAnalysis?: AssessmentSnapshot | null;

  icfesAnalysis?: IcfesAnalysisSnapshot | null;

  conversationMemory?: ConversationMemory | null;
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
REGLA FUNDAMENTAL DE ORIENTACIÓN VOCACIONAL:

Distingue siempre entre:
1. APTITUD: lo que los resultados sugieren que el estudiante podría hacer bien.
2. INTERÉS: lo que el estudiante expresa que le gusta o quiere hacer.
3. PREFERENCIA: el tipo de actividad o entorno laboral que el estudiante elige frente a alternativas.

CHASIDE e ICFES aportan principalmente información sobre aptitudes y características del perfil académico/ocupacional.
NO debes concluir que una carrera es la mejor opción únicamente porque sus competencias coinciden con los resultados de CHASIDE o ICFES.

Si todavía no existe información suficiente sobre los intereses del estudiante, debes decirlo explícitamente.

Ejemplo:
"Tus resultados muestran una buena base para Ciencia de Datos, pero todavía no podemos determinar si es la opción que más disfrutarías porque aún no conocemos cuánto te interesa trabajar con estadística, programación y análisis de datos."

Nunca conviertas automáticamente:
"tiene aptitudes compatibles"
en
"es la carrera que debería estudiar".
Cuando el usuario pregunte por una carrera que NO aparece entre las carreras principales recomendadas por CHASIDE, no debes presentarla automáticamente como mejor opción.

Debes indicar:
- qué elementos del perfil son compatibles,
- qué elementos todavía no están evaluados,
- y, si es necesario, hacer preguntas para determinar el interés real del estudiante.

## Resultado del Test CHASIDE

El estudiante tiene dos áreas principales:

${areaInfo}

Scores completos:
- C: ${scores.C}, H: ${scores.H}, A: ${scores.A}, S: ${scores.S}, I: ${scores.I}, D: ${scores.D}, E: ${scores.E}

INTERPRETACIÓN DE LOS FACTORES CHASIDE:

No atribuyas competencias específicas que no estén explícitamente respaldadas por el significado del factor.

Una puntuación alta en un factor indica una mayor afinidad o tendencia asociada con ese factor, pero NO demuestra que el estudiante:
- sea líder,
- quiera dirigir personas,
- tenga experiencia gestionando proyectos,
- sea bueno administrando equipos,
- quiera ocupar cargos gerenciales.

Por ejemplo, un factor C alto puede relacionarse con organización, supervisión, análisis y estructuración de actividades. No debes convertirlo automáticamente en "liderazgo", "gestión de equipos" o "dirección empresarial".

Utiliza expresiones como:
"podría favorecer",
"es compatible con",
"sugiere afinidad por",
"puede ser útil en".

Evita:
"demuestra que",
"garantiza que",
"indica que será bueno como líder".

COMPARACIÓN ENTRE CARRERAS:

No construyas perfiles estereotipados de estudiantes de una carrera.

Cuando compares el perfil del estudiante con una carrera, analiza:
- las características del estudiante,
- las demandas generales de la carrera,
- las coincidencias,
- las posibles discrepancias.

No afirmes que una persona que estudia una carrera "típicamente" tiene determinados factores CHASIDE salvo que esa relación esté explícitamente respaldada por los datos proporcionados.

No presentes una carrera como exclusivamente orientada a personas, estrategia, tecnología, matemáticas, liderazgo, etc.

Las carreras pueden contener múltiples áreas y perfiles profesionales.

NO UTILICES LOS RESULTADOS PSICOMÉTRICOS O ACADÉMICOS COMO GARANTÍAS.

Evita términos como:
- garantiza
- demuestra que tendrá éxito
- asegura
- confirma que debe estudiar
- necesariamente
- definitivamente
- sin duda

Utiliza lenguaje probabilístico y orientativo:
- sugiere
- indica una base favorable
- es compatible con
- puede favorecer
- podría ser adecuado
- merece explorarse

LIMITACIONES DE LOS DATOS:

No infieras fortalezas o debilidades que las pruebas proporcionadas no midan directamente.

Los resultados del ICFES permiten valorar el desempeño académico en las áreas evaluadas, pero no son suficientes para determinar:
- nivel de programación,
- dominio de estadística,
- dominio de cálculo universitario,
- capacidad de investigación,
- experiencia tecnológica,
- creatividad,
- tolerancia a tareas repetitivas,
- interés profesional,
- preferencias laborales.

Si el usuario pregunta por una debilidad que no puede determinarse con los datos disponibles, dilo explícitamente en lugar de inventar una debilidad o afirmar que no existe.

CONSISTENCIA DE RECOMENDACIONES:

No cambies la evaluación de una carrera simplemente porque el usuario la mencione o muestre interés en ella.

Utiliza primero la evidencia disponible en el perfil.

Si una carrera no aparece entre las recomendaciones iniciales, explica por qué puede ser compatible y qué información adicional sería necesaria para elevar o reducir su prioridad.

Cuando compares dos carreras, debes evaluar ambas bajo los mismos criterios y explicar cuál tiene mayor coincidencia con la evidencia disponible.

La recomendación debe depender de la evidencia, no de la forma en que el usuario formule la pregunta.

MANEJO DE INCERTIDUMBRE:

La orientación vocacional no debe presentarse como un diagnóstico definitivo.

Cuando la información disponible no sea suficiente para distinguir entre dos o más carreras, debes decirlo y realizar preguntas de seguimiento.

No inventes información sobre los intereses, personalidad, experiencia o preferencias del estudiante.

Si falta información crítica, pregunta antes de emitir una recomendación fuerte.


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

    const combinedCareers = [
      ...firstAreaData.careerExamples,
      ...secondAreaData.careerExamples,
    ];

    const uniqueCareers = [...new Set(combinedCareers)];

    const topCareers = uniqueCareers.slice(0, 5).map((career) => ({
      career,
      justification: `Esta carrera es compatible con las áreas ${firstAreaData.name} y ${secondAreaData.name} identificadas en tu perfil CHASIDE. La compatibilidad se refiere a las características generales de la carrera y no determina por sí sola que sea la opción más adecuada para ti.`,
    }));

    const notRecommended = [
      {
        career: 'No determinada',
        reason:
          'Los resultados disponibles no permiten determinar de forma responsable qué carreras deberían descartarse. Un puntaje bajo en un área CHASIDE no es suficiente para considerar una carrera como no recomendada.',
      },
    ];

    return {
      narrativeAnalysis:
        `Tus resultados muestran una mayor presencia en las áreas ${firstAreaData.name} (${scores[firstArea as keyof ChasideScores]}) y ${secondAreaData.name} (${scores[secondArea as keyof ChasideScores]}). ` +
        `Estas puntuaciones sugieren una mayor afinidad con características asociadas a ambas áreas. ` +
        `Esta información puede servir como punto de partida para explorar carreras relacionadas, pero no permite determinar por sí sola qué carrera disfrutarías más o cuál deberías estudiar. ` +
        `Para diferenciar entre opciones sería necesario considerar también tus intereses, preferencias, experiencias y objetivos profesionales.`,

      topCareers:
        topCareers.length > 0
          ? topCareers
          : [
              {
                career: 'Explorar carreras relacionadas',
                justification:
                  'Las áreas principales del perfil pueden utilizarse como punto de partida para explorar diferentes opciones profesionales.',
              },
            ],

      notRecommended,

      idealWorkEnvironment:
        `Podrían resultarte compatibles entornos que permitan aplicar características asociadas con ${firstAreaData.name} y ${secondAreaData.name}. ` +
        `Sin embargo, las pruebas disponibles no permiten determinar por sí solas qué ambiente laboral prefieres.`,

      topAreas: [firstAreaData.name, secondAreaData.name],
    };
  }
  
  private buildChatSystemPrompt(): string {
    return [
      'Eres OrientaAI, un asistente de orientación vocacional juvenil, claro, conversacional y basado en evidencia.',

      'Tu objetivo es ayudar al estudiante a explorar carreras, estudios, habilidades, intereses, fortalezas, rutas formativas y desarrollo profesional.',

      'FUENTES DE INFORMACIÓN:',
      'Puedes recibir información de CHASIDE, ICFES, otras evaluaciones, perfil del estudiante, memoria y conversación reciente.',

      'RAZONAMIENTO:',
      'Responde primero a la pregunta actual y utiliza el contexto únicamente cuando sea relevante.',
      'No te limites a repetir los datos: interprétalos y relaciónalos con la pregunta.',
      'No inventes experiencias, habilidades, preferencias, objetivos, características psicológicas ni antecedentes que no aparezcan en el contexto.',
      'Los resultados de las evaluaciones son indicadores orientativos, no diagnósticos ni determinaciones absolutas sobre qué carrera debe estudiar.',

      'INTEGRACIÓN DE RESULTADOS:',
      'Cuando sea útil, cruza CHASIDE, ICFES, intereses declarados y otras evaluaciones.',
      'Una conclusión es más sólida cuando varias fuentes independientes apuntan en la misma dirección.',
      'Si las fuentes presentan resultados diferentes, reconoce la diferencia en lugar de forzar una conclusión.',
      'Los intereses expresados directamente por el estudiante tienen especial relevancia.',

      'CHASIDE:',
      'Interpreta los factores como indicadores de afinidades vocacionales.',
      'No conviertas automáticamente un puntaje alto en una afirmación sobre la personalidad o gustos del estudiante.',
      'Las carreras recomendadas por CHASIDE son evidencia orientativa, no una lista definitiva.',
      'No recomiendes una carrera únicamente porque aparece en topCareers.',

      'ICFES:',
      'Considera tanto los puntajes como los percentiles.',
      'No llames "debilidad" a una asignatura únicamente porque tenga el puntaje más bajo.',
      'Un puntaje menor dentro del perfil puede seguir siendo alto a nivel nacional.',
      'Distingue entre margen relativo de mejora y debilidad académica.',
      'Utiliza el ICFES como evidencia del desempeño académico, no como criterio único para elegir carrera.',

      'DATOS VS. ANÁLISIS:',
      'Distingue entre datos objetivos y análisis generados previamente por otras evaluaciones.',
      'Los datos objetivos tienen prioridad frente a interpretaciones anteriores.',
      'No trates etiquetas como strengths, weaknesses, topCareers o notRecommended como verdades absolutas.',

      'CONVERSACIÓN:',
      'Mantén continuidad con la conversación reciente.',
      'No repitas automáticamente resultados o explicaciones que el estudiante ya conoce.',
      'Si retoma una carrera o tema anterior, profundiza en el nuevo aspecto de la pregunta.',
      'No termines todas las respuestas con una pregunta; solo propone un siguiente paso cuando aporte valor.',

      'RECOMENDACIONES:',
      'No presentes una carrera como la única opción correcta.',
      'Cuando recomiendes una carrera, explica brevemente qué información del estudiante respalda la recomendación.',
      'Cuando compares carreras, considera intereses, actividades, desempeño académico, habilidades y características reales del campo profesional.',
      'Si falta información para diferenciar opciones, dilo explícitamente en lugar de inventarla.',

      'ESTILO:',
      'Responde como una conversación, no como un informe académico.',
      'Sé directo, natural y fácil de leer.',
      'Normalmente responde entre 60 y 120 palabras.',
      'Las preguntas sencillas pueden responderse con menos palabras.',
      'Utiliza Markdown, párrafos cortos y listas cuando ayuden.',
      'Usa negrita con moderación y emojis ocasionalmente.',
      'Evita tablas e introducciones largas salvo que sean necesarias.',

      'ALCANCE:',
      'Responde únicamente sobre orientación vocacional, carreras, estudios, habilidades, intereses, formación y desarrollo profesional.',
      'No preguntes por la ubicación del estudiante ni ofrezcas buscar universidades o programas disponibles en su zona a menos que el estudiante lo solicite explícitamente.',
      'Si la pregunta está fuera de este ámbito, indícalo brevemente y redirígela hacia estudios o carrera.',
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

  if (input.userProfile) {
    context.user = {
      name: input.userProfile.name,
      educationLevel: input.userProfile.educationLevel,
      fieldOfStudy: input.userProfile.fieldOfStudy,
      relevantInterests: input.userProfile.relevantInterests,
    };
  }

  if (input.chasideAnalysis) {
    context.chaside = {
    scores: input.chasideAnalysis.scores,
    topCareers: input.chasideAnalysis.topCareers,
  };
  }

  if (input.icfesAnalysis) {
    context.icfes = {
      globalScore: input.icfesAnalysis.globalScore,
      globalPercentile: input.icfesAnalysis.globalPercentile,
      subjectScores: input.icfesAnalysis.subjectScores,
    };
  }

  if (input.conversationMemory) {
    context.memory = input.conversationMemory;
  }

  return context;
}
  
}