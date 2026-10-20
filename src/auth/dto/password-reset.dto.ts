import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH } from './register.dto';

export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MaxLength(2_000)
  token!: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: `La contraseña debe tener máximo ${PASSWORD_MAX_LENGTH} caracteres`,
  })
  password!: string;
}
