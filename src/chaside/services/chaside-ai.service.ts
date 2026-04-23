import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { ChasideScores, ContextData } from './chaside-scoring.service';

export interface AiAnalysisResult {
  narrativeAnalysis: string;
  topCareers: { career: string; justification: string }[];
  notRecommended: { career: string; reason: string }[];
  idealWorkEnvironment: string;
}

@Injectable()
export class ChasideAiService {
  private readonly client: OpenAI;
  private readonly logger = new Logger(ChasideAiService.name);

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });
  }

  async analyze(scores: ChasideScores, contextData: ContextData): Promise<AiAnalysisResult> {
    this.logger.log('Llamando a Groq API...');

    const response = await this.client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 2048,
      messages: [{ role: 'user', content: this.buildPrompt(scores, contextData) }],
    });

    const rawText = response.choices[0].message.content!;
    return this.parseResponse(rawText);
  }

  private buildPrompt(scores: ChasideScores, contextData: ContextData): string {
    return `
Eres un orientador vocacional experto en el test CHASIDE con amplio conocimiento del sistema educativo latinoamericano.

## Scores CHASIDE del estudiante:
- C (Científico):    ${scores.C}
- H (Humanístico):   ${scores.H}
- A (Artístico):     ${scores.A}
- S (Social):        ${scores.S}
- I (Investigativo): ${scores.I}
- D (Dirigente):     ${scores.D}
- E (Emprendedor):   ${scores.E}

## Contexto adicional del estudiante:
- Localización: ${JSON.stringify(contextData.LOCATION)}
- Intereses: ${JSON.stringify(contextData.INTEREST)}
- Actividades: ${JSON.stringify(contextData.ACTIVITY)}
- Perfil académico: ${JSON.stringify(contextData.ACADEMIC)}

## Instrucciones:
Analiza el perfil completo considerando tanto los scores CHASIDE como el contexto.
Ten en cuenta la localización para recomendar carreras accesibles en su región.

Responde ÚNICAMENTE con un JSON válido, sin texto adicional, sin markdown, sin backticks:

{
  "narrativeAnalysis": "3-4 párrafos de análisis personalizado del perfil vocacional",
  "topCareers": [
    { "career": "nombre carrera", "justification": "por qué encaja con ESTE perfil específico" },
    { "career": "nombre carrera", "justification": "por qué encaja con ESTE perfil específico" },
    { "career": "nombre carrera", "justification": "por qué encaja con ESTE perfil específico" },
    { "career": "nombre carrera", "justification": "por qué encaja con ESTE perfil específico" },
    { "career": "nombre carrera", "justification": "por qué encaja con ESTE perfil específico" }
  ],
  "notRecommended": [
    { "career": "nombre carrera", "reason": "por qué NO encajaría con este perfil" },
    { "career": "nombre carrera", "reason": "por qué NO encajaría con este perfil" }
  ],
  "idealWorkEnvironment": "descripción del ambiente de trabajo ideal para este perfil"
}
    `.trim();
  }

  private parseResponse(raw: string): AiAnalysisResult {
    try {
      const clean = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch (error) {
      this.logger.error('Error parseando respuesta de Groq', error);
      throw new Error('La respuesta de Groq no es JSON válido');
    }
  }
}