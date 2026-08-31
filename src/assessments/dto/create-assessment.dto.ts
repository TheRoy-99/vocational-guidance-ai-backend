import { IsArray, IsDefined, IsInt, IsObject, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAssessmentDto {
  @IsNotEmpty()
  @IsObject()
  rawAnswers!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  vocationalProfile?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  vocationalResults?: unknown[];

  @IsOptional()
  @IsString()
  assessmentType?: string;

  @IsOptional()
  @IsString()
  engineVersion?: string;

  @IsOptional()
  @IsString()
  questionnaireVersion?: string;

  @IsOptional()
  @IsString()
  scoringVersion?: string;

  @IsOptional()
  @IsString()
  currentPhase?: string;
}

export class CreateAssessmentAnswerDto {
  @IsUUID()
  id!: string;

  @IsString()
  questionId!: string;

  @IsString()
  phase!: string;

  @IsDefined()
  answerValue!: unknown;

  @IsInt()
  position!: number;

  @IsOptional()
  @IsString()
  questionText?: string;

  @IsOptional()
  @IsString()
  questionType?: string;

  @IsOptional()
  @IsOptional()
  @IsArray()
  options?: unknown;
}

export class CreateAssessmentEventDto {
  @IsUUID()
  id!: string;

  @IsUUID()
  eventId!: string;

  @IsString()
  phase!: string;

  @IsString()
  eventType!: string;

  @IsOptional()
  @IsString()
  questionId?: string;

  @IsOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
