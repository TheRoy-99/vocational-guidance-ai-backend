import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export enum QuestionCategory {
  // CHASIDE clásico
  C = 'C',
  H = 'H',
  A = 'A',
  S = 'S',
  I = 'I',
  D = 'D',
  E = 'E',
  // Contexto adicional
  LOCATION = 'LOCATION',
  INTEREST = 'INTEREST',
  ACTIVITY = 'ACTIVITY',
  ACADEMIC = 'ACADEMIC',
}

export enum QuestionType {
  BOOLEAN = 'boolean',
  SCALE = 'scale',
}

export class AnswerDto {
  @IsInt()
  questionId!: number;

  @IsEnum(QuestionCategory)
  category!: QuestionCategory;

  @IsEnum(QuestionType)
  type!: QuestionType;

  // boolean para Sí/No, number para escala 1-5
  @IsNumber()
  value!: number | boolean;
}

export class SubmitAssessmentDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers!: AnswerDto[];
}
