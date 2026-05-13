import { Injectable } from '@nestjs/common';
import {
  AnswerDto,
  QuestionCategory,
  QuestionType,
} from '../dto/submit-assessment.dto';

export interface ChasideScores {
  C: number;
  H: number;
  A: number;
  S: number;
  I: number;
  D: number;
  E: number;
}

export interface ContextData {
  LOCATION: AnswerDto[];
  INTEREST: AnswerDto[];
  ACTIVITY: AnswerDto[];
  ACADEMIC: AnswerDto[];
}

const CHASIDE_CATEGORIES = ['C', 'H', 'A', 'S', 'I', 'D', 'E'];
const CONTEXT_CATEGORIES = ['LOCATION', 'INTEREST', 'ACTIVITY', 'ACADEMIC'];

@Injectable()
export class ChasideScoringService {
  // Punto de entrada principal — separa CHASIDE de contexto
  process(answers: AnswerDto[]): {
    scores: ChasideScores;
    contextData: ContextData;
  } {
    const chasideAnswers = answers.filter((a) =>
      CHASIDE_CATEGORIES.includes(a.category),
    );
    const contextAnswers = answers.filter((a) =>
      CONTEXT_CATEGORIES.includes(a.category),
    );

    return {
      scores: this.calculateScores(chasideAnswers),
      contextData: this.extractContext(contextAnswers),
    };
  }

  private calculateScores(answers: AnswerDto[]): ChasideScores {
    // Inicializa scores en 0 para cada categoría CHASIDE
    const scores: ChasideScores = { C: 0, H: 0, A: 0, S: 0, I: 0, D: 0, E: 0 };

    for (const answer of answers) {
      const cat = answer.category as keyof ChasideScores;

      if (answer.type === QuestionType.BOOLEAN) {
        // Sí/No: suma 1 si es true
        if (answer.value === true || answer.value === 1) {
          scores[cat] += 1;
        }
      } else if (answer.type === QuestionType.SCALE) {
        // Escala 1-5: normaliza a puntos (valor / 5)
        // Así es comparable con las respuestas booleanas
        scores[cat] += Number(answer.value) / 5;
      }
    }

    // Redondea a 2 decimales para presentación limpia
    Object.keys(scores).forEach((key) => {
      scores[key as keyof ChasideScores] =
        Math.round(scores[key as keyof ChasideScores] * 100) / 100;
    });

    return scores;
  }

  private extractContext(answers: AnswerDto[]): ContextData {
    // Agrupa respuestas de contexto por categoría para enviarlas a Claude
    return {
      LOCATION: answers.filter((a) => a.category === QuestionCategory.LOCATION),
      INTEREST: answers.filter((a) => a.category === QuestionCategory.INTEREST),
      ACTIVITY: answers.filter((a) => a.category === QuestionCategory.ACTIVITY),
      ACADEMIC: answers.filter((a) => a.category === QuestionCategory.ACADEMIC),
    };
  }
}
