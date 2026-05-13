import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class VocationalChatDto {
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsUUID()
  assessmentId?: string;
}