// Validación del feedback de la evaluación.
//
// No se usa un DTO con class-validator porque el frontend envía, además de los
// campos conocidos, una copia de cada respuesta como campo propio
// ([key: string]: unknown); con forbidNonWhitelisted esos campos se
// rechazarían. Aquí se limitan tipos y tamaños de lo que sí se guarda, y el
// servicio sigue ignorando el resto.

import { BadRequestException } from '@nestjs/common';

export const FEEDBACK_LIMITS = {
  /** El cuestionario tiene 18 preguntas: 50 deja margen para versiones futuras. */
  maxAnswers: 50,
  maxTextLength: 5_000,
  maxShortTextLength: 100,
  /** Tamaño máximo de responseValue o studentPerceivedBenefits serializado. */
  maxJsonLength: 5_000,
  maxPosition: 1_000,
} as const;

export const FEEDBACK_EVENT_TYPES = [
  'feedback_started',
  'feedback_abandoned',
  'feedback_completed',
] as const;

const EVALUATOR_TYPES = ['STUDENT_USER', 'EVALUATOR'];
const FEEDBACK_CONTEXTS = [
  'ADAPTIVE_ASSESSMENT',
  'ICFES',
  'CHASIDE',
  'PLATFORM_GENERAL',
];
const FEEDBACK_STATUSES = [
  'DRAFT',
  'SUBMITTING',
  'COMPLETED',
  'ABANDONED',
  'DISMISSED',
];

/** Campos de texto libre que se guardan en assessment_feedback. */
const TEXT_FIELDS = [
  'respondentProfile',
  'discoveryEffect',
  'questionRelevance',
  'actionIntent',
  'studentOutcome',
  'educationalPotential',
  'openFeedback',
  'disagreementReason',
];

function fail(message: string): never {
  throw new BadRequestException(message);
}

function isPositionInRange(value: unknown): boolean {
  return (
    Number.isInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= FEEDBACK_LIMITS.maxPosition
  );
}

function checkOptionalString(field: string, value: unknown, maxLength: number) {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string' || value.length > maxLength) {
    fail(`${field} debe ser un texto de máximo ${maxLength} caracteres`);
  }
}

// El frontend convierte en número las respuestas que empiezan con 1-5
// ("4 — Bastante" → 4), así que un campo de texto también puede llegar como número.
function checkOptionalTextOrNumber(field: string, value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return;
  checkOptionalString(field, value, FEEDBACK_LIMITS.maxTextLength);
}

function checkOptionalEnum(field: string, value: unknown, allowed: string[]) {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string' || !allowed.includes(value)) {
    fail(`${field} no es válido`);
  }
}

function checkOptionalPosition(field: string, value: unknown) {
  if (value === undefined || value === null) return;
  if (!isPositionInRange(value)) {
    fail(
      `${field} debe ser un entero entre 0 y ${FEEDBACK_LIMITS.maxPosition}`,
    );
  }
}

function checkJsonSize(field: string, value: unknown) {
  if (value === undefined) return;
  const serialized = JSON.stringify(value) ?? '';
  if (serialized.length > FEEDBACK_LIMITS.maxJsonLength) {
    fail(`${field} es demasiado grande`);
  }
}

/**
 * Valida el cuerpo de POST y PATCH /feedback/assessment.
 * `requireCreateFields` exige los campos obligatorios al crear.
 */
export function assertValidAssessmentFeedback(
  input: unknown,
  { requireCreateFields }: { requireCreateFields: boolean },
): void {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('El feedback debe ser un objeto');
  }
  const body = input as Record<string, unknown>;

  if (requireCreateFields) {
    if (
      typeof body.idempotencyKey !== 'string' ||
      !body.idempotencyKey.trim() ||
      body.idempotencyKey.length > FEEDBACK_LIMITS.maxShortTextLength
    ) {
      fail('idempotencyKey es obligatorio');
    }
    if (typeof body.evaluatorType !== 'string') {
      fail('evaluatorType es obligatorio');
    }
    if (typeof body.questionnaireVersion !== 'string') {
      fail('questionnaireVersion es obligatorio');
    }
  }

  checkOptionalEnum('evaluatorType', body.evaluatorType, EVALUATOR_TYPES);
  checkOptionalEnum('feedbackContext', body.feedbackContext, FEEDBACK_CONTEXTS);
  checkOptionalEnum('status', body.status, FEEDBACK_STATUSES);
  checkOptionalString(
    'questionnaireVersion',
    body.questionnaireVersion,
    FEEDBACK_LIMITS.maxShortTextLength,
  );
  checkOptionalString(
    'assessmentId',
    body.assessmentId,
    FEEDBACK_LIMITS.maxShortTextLength,
  );
  checkOptionalString(
    'startedAt',
    body.startedAt,
    FEEDBACK_LIMITS.maxShortTextLength,
  );
  checkOptionalPosition('questionCountShown', body.questionCountShown);
  checkOptionalPosition('lastQuestionReached', body.lastQuestionReached);

  for (const field of TEXT_FIELDS) {
    checkOptionalTextOrNumber(field, body[field]);
  }
  checkJsonSize('studentPerceivedBenefits', body.studentPerceivedBenefits);

  if (body.answers === undefined) return;
  if (!Array.isArray(body.answers)) {
    fail('answers debe ser una lista');
  }
  if (body.answers.length > FEEDBACK_LIMITS.maxAnswers) {
    fail(`answers admite máximo ${FEEDBACK_LIMITS.maxAnswers} respuestas`);
  }
  for (const answer of body.answers as unknown[]) {
    if (!answer || typeof answer !== 'object') {
      fail('Cada respuesta debe ser un objeto');
    }
    const item = answer as Record<string, unknown>;
    if (
      typeof item.questionId !== 'string' ||
      !item.questionId ||
      item.questionId.length > FEEDBACK_LIMITS.maxShortTextLength
    ) {
      fail('Cada respuesta necesita un questionId válido');
    }
    if (
      typeof item.responseType !== 'string' ||
      item.responseType.length > FEEDBACK_LIMITS.maxShortTextLength
    ) {
      fail('Cada respuesta necesita un responseType válido');
    }
    if (!isPositionInRange(item.position)) {
      fail('Cada respuesta necesita una posición válida');
    }
    checkOptionalTextOrNumber('responseText', item.responseText);
    checkJsonSize('responseValue', item.responseValue);
  }
}

/** Valida el cuerpo de POST /feedback/assessment/:id/events. */
export function assertValidFeedbackEvent(
  eventType: unknown,
  position: unknown,
) {
  if (
    typeof eventType !== 'string' ||
    !(FEEDBACK_EVENT_TYPES as readonly string[]).includes(eventType)
  ) {
    fail(`eventType debe ser uno de: ${FEEDBACK_EVENT_TYPES.join(', ')}`);
  }
  checkOptionalPosition('position', position);
}
