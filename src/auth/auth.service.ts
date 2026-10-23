// SRP aplicado: AuthService solo maneja registro, login, firma de tokens y
// restablecimiento de contraseña.
// NO accede directamente a Prisma — delega en UsersService.
// Esta indirección permite testear AuthService mockeando UsersService.

import {
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';

const PASSWORD_RESET_PURPOSE = 'password-reset';
const PASSWORD_RESET_TTL_MINUTES = 30;
export const TERMS_AND_CONDITIONS_VERSION = '2026-10-23';

export const FORGOT_PASSWORD_MESSAGE =
  'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña. Revisa tu bandeja de entrada y la carpeta de spam.';
export const INVALID_RESET_LINK_MESSAGE =
  'El enlace no es válido o ya venció. Solicita uno nuevo.';

@Injectable()
export class AuthService {
  // BCRYPT_ROUNDS: 12 es el balance industria entre seguridad y rendimiento.
  // Menos de 10 es inseguro; más de 14 impacta la latencia en producción.
  private readonly BCRYPT_ROUNDS = 12;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    // 1. Verificar unicidad del email antes de hashear (fail fast)
    const exists = await this.usersService.findByEmail(email);
    if (exists) {
      throw new ConflictException('El email ya está registrado');
    }

    // 2. Hashear contraseña — NUNCA almacenar texto plano
    const hashedPassword = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);

    // 3. Crear usuario con contraseña hasheada
    const user = await this.usersService.create({
      name: dto.name,
      email,
      password: hashedPassword,
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_AND_CONDITIONS_VERSION,
    });

    // 4. Retornar token directamente — UX: el usuario queda logueado al registrarse
    return this.signToken(user.id, user.name, user.email, user.role);
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();

    // 1. Buscar usuario — mensaje genérico para no revelar si el email existe
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // 2. Comparar contraseña con hash almacenado
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return this.signToken(user.id, user.name, user.email, user.role);
  }

  /**
   * Envía el enlace para restablecer la contraseña. Responde siempre lo mismo,
   * exista o no la cuenta, para no revelar qué correos están registrados.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(email);

    if (user) {
      const token = this.jwtService.sign(
        { sub: user.id, purpose: PASSWORD_RESET_PURPOSE },
        {
          secret: this.passwordResetSecret(user.password),
          expiresIn: `${PASSWORD_RESET_TTL_MINUTES}m`,
        },
      );
      const frontendUrl = (
        this.configService.get<string>('FRONTEND_URL') ||
        'http://localhost:3000'
      ).replace(/\/$/, '');
      const resetUrl = `${frontendUrl}/login/reset-password?token=${encodeURIComponent(token)}`;

      // Sin await: si se esperara el envío, la respuesta tardaría más cuando la
      // cuenta existe y eso permitiría deducir qué correos están registrados.
      void this.mailService
        .sendPasswordReset(
          user.email,
          user.name,
          resetUrl,
          PASSWORD_RESET_TTL_MINUTES,
        )
        .catch((error: unknown) => {
          this.logger.error(
            `No se pudo enviar el correo para restablecer la contraseña: ${error instanceof Error ? error.message : 'error desconocido'}`,
          );
        });
    }

    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const invalidLink = new BadRequestException(INVALID_RESET_LINK_MESSAGE);

    // Primero se lee el token sin verificar, solo para saber de qué usuario es:
    // la clave de firma depende de su contraseña actual.
    let claims: { sub?: unknown; purpose?: unknown } | null = null;
    try {
      claims = this.jwtService.decode<{ sub?: unknown; purpose?: unknown }>(
        dto.token,
      );
    } catch {
      throw invalidLink;
    }
    if (
      typeof claims?.sub !== 'string' ||
      claims.purpose !== PASSWORD_RESET_PURPOSE
    ) {
      throw invalidLink;
    }

    const user = await this.usersService.findByIdWithPassword(claims.sub);
    if (!user) {
      throw invalidLink;
    }

    try {
      this.jwtService.verify(dto.token, {
        secret: this.passwordResetSecret(user.password),
      });
    } catch {
      // Firma inválida, vencido o ya usado (la contraseña cambió).
      throw invalidLink;
    }

    const hashedPassword = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);
    await this.usersService.updatePassword(user.id, hashedPassword);

    return { message: 'Tu contraseña se actualizó. Ya puedes iniciar sesión.' };
  }

  /**
   * Clave para firmar el enlace de restablecimiento: JWT_SECRET más el hash de
   * la contraseña actual. Así el enlace:
   * - sirve una sola vez: al cambiar la contraseña cambia la clave y deja de
   *   ser válido, sin necesidad de guardar los tokens en una tabla;
   * - no sirve como token de sesión: JwtStrategy lo verifica solo con JWT_SECRET.
   */
  private passwordResetSecret(passwordHash: string): string {
    return `${this.configService.getOrThrow<string>('JWT_SECRET')}:${passwordHash}`;
  }

  private signToken(userId: string, name: string, email: string, role: string) {
    const payload = { sub: userId, email, role };
    return {
      accessToken: this.jwtService.sign(payload),
      // Retornamos info básica del user para que el frontend
      // no necesite hacer un GET /users/me adicional tras el login
      user: { id: userId, name, email, role },
    };
  }
}
