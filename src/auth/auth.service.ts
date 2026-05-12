// SRP aplicado: AuthService solo maneja registro, login y firma de tokens.
// NO accede directamente a Prisma — delega en UsersService.
// Esta indirección permite testear AuthService mockeando UsersService.

import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  // BCRYPT_ROUNDS: 12 es el balance industria entre seguridad y rendimiento.
  // Menos de 10 es inseguro; más de 14 impacta la latencia en producción.
  private readonly BCRYPT_ROUNDS = 12;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    // 1. Verificar unicidad del email antes de hashear (fail fast)
    const exists = await this.usersService.findByEmail(dto.email);
    if (exists) {
      throw new ConflictException('El email ya está registrado');
    }

    // 2. Hashear contraseña — NUNCA almacenar texto plano
    const hashedPassword = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);

    // 3. Crear usuario con contraseña hasheada
    const user = await this.usersService.create({
      ...dto,
      password: hashedPassword,
    });

    // 4. Retornar token directamente — UX: el usuario queda logueado al registrarse
    return this.signToken(user.id, user.name, user.email, user.role);
  }

  async login(dto: LoginDto) {
    // 1. Buscar usuario — mensaje genérico para no revelar si el email existe
    const user = await this.usersService.findByEmail(dto.email);
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
