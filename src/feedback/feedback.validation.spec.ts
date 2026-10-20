import { BadRequestException } from '@nestjs/common';
import {
  FEEDBACK_LIMITS,
  assertValidAssessmentFeedback,
  assertValidFeedbackEvent,
} from './feedback.validation';

// Misma forma que arma AssessmentFeedback.tsx al completar el cuestionario:
// campos conocidos, `answers`, y una copia de cada respuesta como campo propio.
const frontendPayload = () => ({
  idempotencyKey: '5f4c5b4e-3f2a-4b8d-9c1e-1a2b3c4d5e6f',
  assessmentId: null,
  evaluatorType: 'STUDENT_USER',
  feedbackContext: 'ADAPTIVE_ASSESSMENT',
  questionnaireVersion: 'feedback-v2',
  status: 'COMPLETED',
  startedAt: '2026-10-20T15:00:00.000Z',
  questionCountShown: 18,
  lastQuestionReached: 18,
  answers: [
    {
      questionId: 'clarityGain',
      responseType: 'LIKERT',
      responseValue: 4,
      position: 0,
    },
    {
      questionId: 'studentPerceivedBenefits',
      responseType: 'MULTI_SELECT',
      responseValue: ['Conocerme mejor', 'Descubrir carreras'],
      position: 1,
    },
    {
      questionId: 'openFeedback',
      responseType: 'TEXTAREA',
      responseValue: 'Me ayudó a pensar en otras opciones.',
      responseText: 'Me ayudó a pensar en otras opciones.',
      position: 2,
    },
  ],
  clarityGain: 4,
  // El frontend convierte "3 — Parcialmente pertinentes" en 3.
  discoveryEffect: 3,
  studentPerceivedBenefits: ['Conocerme mejor', 'Descubrir carreras'],
  openFeedback: 'Me ayudó a pensar en otras opciones.',
  campoQueElBackendIgnora: 'se acepta y no se guarda',
});

const expectBadRequest = (run: () => void) =>
  expect(run).toThrow(BadRequestException);

describe('assertValidAssessmentFeedback', () => {
  it('acepta el payload que envía el frontend', () => {
    expect(() =>
      assertValidAssessmentFeedback(frontendPayload(), {
        requireCreateFields: true,
      }),
    ).not.toThrow();
  });

  it('exige idempotencyKey al crear, pero no al actualizar', () => {
    const withoutKey: Record<string, unknown> = frontendPayload();
    delete withoutKey.idempotencyKey;

    expectBadRequest(() =>
      assertValidAssessmentFeedback(withoutKey, { requireCreateFields: true }),
    );
    expect(() =>
      assertValidAssessmentFeedback(withoutKey, { requireCreateFields: false }),
    ).not.toThrow();
  });

  it('rechaza más respuestas que el máximo permitido', () => {
    const payload = frontendPayload();
    payload.answers = Array.from(
      { length: FEEDBACK_LIMITS.maxAnswers + 1 },
      (_, position) => ({
        questionId: `q${position}`,
        responseType: 'LIKERT',
        responseValue: 3,
        position,
      }),
    );

    expectBadRequest(() =>
      assertValidAssessmentFeedback(payload, { requireCreateFields: true }),
    );
  });

  it('rechaza textos demasiado largos', () => {
    const payload = {
      ...frontendPayload(),
      openFeedback: 'x'.repeat(FEEDBACK_LIMITS.maxTextLength + 1),
    };

    expectBadRequest(() =>
      assertValidAssessmentFeedback(payload, { requireCreateFields: true }),
    );
  });

  it('rechaza valores de respuesta demasiado grandes', () => {
    const payload = frontendPayload();
    payload.answers[0].responseValue = 'x'.repeat(
      FEEDBACK_LIMITS.maxJsonLength + 1,
    ) as unknown as number;

    expectBadRequest(() =>
      assertValidAssessmentFeedback(payload, { requireCreateFields: true }),
    );
  });

  it.each([
    ['evaluatorType', 'HACKER'],
    ['status', 'BORRADO'],
    ['lastQuestionReached', -1],
  ])('rechaza un %s inválido', (field, value) => {
    const payload = { ...frontendPayload(), [field]: value };

    expectBadRequest(() =>
      assertValidAssessmentFeedback(payload, { requireCreateFields: true }),
    );
  });
});

describe('assertValidFeedbackEvent', () => {
  it.each(['feedback_started', 'feedback_abandoned', 'feedback_completed'])(
    'acepta el evento %s',
    (eventType) => {
      expect(() => assertValidFeedbackEvent(eventType, 3)).not.toThrow();
    },
  );

  it('rechaza un tipo de evento desconocido', () => {
    expectBadRequest(() => assertValidFeedbackEvent('cualquier_cosa', 0));
  });

  it('rechaza una posición fuera de rango', () => {
    expectBadRequest(() =>
      assertValidFeedbackEvent('feedback_abandoned', 5_000),
    );
  });
});
