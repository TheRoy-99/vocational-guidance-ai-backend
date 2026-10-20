// class-validator garantiza que los datos malformados jamás lleguen
// al servicio. El controlador queda 100% limpio de validaciones manuales.
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';

// Longitudes máximas: evitan guardar o cifrar textos enormes. 254 es el largo
// máximo de un correo; bcrypt solo usa los primeros 72 bytes de la contraseña,
// pero se admite hasta 128 para no rechazar frases de contraseña largas.
export const NAME_MAX_LENGTH = 100;
export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MAX_LENGTH = 128;

export class RegisterDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(NAME_MAX_LENGTH, {
    message: `El nombre debe tener máximo ${NAME_MAX_LENGTH} caracteres`,
  })
  name!: string;

  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: `La contraseña debe tener máximo ${PASSWORD_MAX_LENGTH} caracteres`,
  })
  password!: string;
}
