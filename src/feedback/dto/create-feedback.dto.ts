import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Cuerpo de POST /feedback (feedback general que se escribe en feedback.log).
 * Con límites de tamaño para que no se pueda llenar el disco del servidor.
 */
export class CreateFeedbackDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  message?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
