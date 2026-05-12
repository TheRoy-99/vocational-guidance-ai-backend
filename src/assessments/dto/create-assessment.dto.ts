import { IsObject, IsNotEmpty } from 'class-validator';

export class CreateAssessmentDto {
  @IsNotEmpty()
  @IsObject()
  rawAnswers!: Record<string, unknown>;
}
