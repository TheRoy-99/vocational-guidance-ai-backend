import { PartialType } from '@nestjs/mapped-types';
import { CreateAssessmentDto } from './create-assessment.dto';
import { IsObject, IsOptional, IsEnum } from 'class-validator';
import { Prisma } from '@prisma/client';

enum AssessmentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
}

export class UpdateAssessmentDto extends PartialType(CreateAssessmentDto) {
  @IsOptional()
  @IsObject()
  scores?: Prisma.InputJsonValue;

  @IsOptional()
  aiAnalysis?: string;

  @IsOptional()
  @IsEnum(AssessmentStatus)
  status?: AssessmentStatus;
}
