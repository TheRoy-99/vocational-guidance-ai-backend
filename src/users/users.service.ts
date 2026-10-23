import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Role, User } from '@prisma/client';
import { UpdateUserDto } from './dto/update-user.dto';

export type SafeUser = Omit<User, 'password'>;

/** Usuario autenticado que hace la petición (req.user). */
export type Requester = { id: string; role: string };

const USER_SELECT_FIELDS = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  updatedAt: true,
  termsAcceptedAt: true,
  termsVersion: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.UserCreateInput): Promise<SafeUser> {
    try {
      // AuthService ya entrega la contraseña hasheada — no volver a hashear
      return await this.prisma.user.create({
        data,
        select: USER_SELECT_FIELDS,
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('El correo ya está en uso');
      }
      throw new InternalServerErrorException('Error crítico al crear el usuario');
    }
  }

  /** Lista todos los usuarios: solo ADMIN. */
  async findAll(requester: Requester): Promise<SafeUser[]> {
    if (!this.isAdmin(requester)) {
      throw new ForbiddenException('No tienes permiso para listar usuarios');
    }
    return this.prisma.user.findMany({ select: USER_SELECT_FIELDS });
  }

  /** Devuelve un usuario si es la propia cuenta del solicitante o si es ADMIN. */
  async findOneFor(requester: Requester, id: string): Promise<SafeUser> {
    this.assertSelfOrAdmin(requester, id);
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException(`Usuario con id ${id} no encontrado`);
    }
    return user;
  }

  // Sin control de acceso: uso interno (JwtStrategy). Las rutas usan findOneFor.
  async findById(id: string): Promise<SafeUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT_FIELDS,
    });
  }

  // Incluye password — solo para uso interno de AuthService (restablecer contraseña)
  async findByIdWithPassword(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  // Recibe la contraseña ya hasheada — solo para uso interno de AuthService
  async updatePassword(id: string, hashedPassword: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });
  }

  // Incluye password — solo para uso interno de AuthService
  async findByEmail(email: string): Promise<User | null> {
    try {
      return await this.prisma.user.findFirst({
        where: { email: { equals: email.trim(), mode: 'insensitive' } },
      });
    } catch (error: any) {
      const databaseUnavailable = ['ETIMEDOUT', 'P1001', 'P1008', 'P2024'].includes(error?.code);
      if (databaseUnavailable) {
        throw new ServiceUnavailableException(
          'No podemos conectarnos a la base de datos en este momento. Intenta nuevamente en unos segundos.',
        );
      }
      throw error;
    }
  }

  async update(
    requester: Requester,
    id: string,
    dto: UpdateUserDto,
  ): Promise<SafeUser> {
    this.assertSelfOrAdmin(requester, id);
    await this.ensureExists(id);

    // Mismo criterio que el registro: correo en minúsculas y sin repetir
    // (el login lo busca sin distinguir mayúsculas).
    const data: UpdateUserDto = { ...dto };
    if (data.email !== undefined) {
      data.email = data.email.trim().toLowerCase();
      const owner = await this.findByEmail(data.email);
      if (owner && owner.id !== id) {
        throw new ConflictException('El correo ya está en uso');
      }
    }

    try {
      return await this.prisma.user.update({
        where: { id },
        data,
        select: USER_SELECT_FIELDS,
      });
    } catch (error) {
      // Otra petición pudo tomar el correo entre la verificación y el update.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('El correo ya está en uso');
      }
      throw error;
    }
  }

  async remove(requester: Requester, id: string): Promise<void> {
    this.assertSelfOrAdmin(requester, id);
    await this.ensureExists(id);
    await this.prisma.user.delete({ where: { id } });
  }

  private isAdmin(requester: Requester): boolean {
    return requester.role === Role.ADMIN;
  }

  // Se valida antes de consultar la base: así un usuario sin permiso recibe
  // siempre 403 y no puede averiguar qué ids existen (403 vs 404).
  private assertSelfOrAdmin(requester: Requester, id: string): void {
    if (requester.id !== id && !this.isAdmin(requester)) {
      throw new ForbiddenException(
        'No tienes permiso para acceder a este usuario',
      );
    }
  }

  private async ensureExists(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Usuario con id ${id} no encontrado`);
    }
  }
}
