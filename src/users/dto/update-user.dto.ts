import { PartialType, OmitType } from '@nestjs/mapped-types';
import { RegisterDto } from '../../auth/dto/register.dto';

export class UpdateUserDto extends PartialType(
  OmitType(RegisterDto, ['password'] as const),
) {}