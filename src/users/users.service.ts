import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, User } from '@prisma/client';
import { UpdateUserDto } from './dto/update-user.dto';

export type SafeUser = Omit<User, 'password'>;

const USER_SELECT_FIELDS = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  updatedAt: true,
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

  async findAll(): Promise<SafeUser[]> {
    return this.prisma.user.findMany({ select: USER_SELECT_FIELDS });
  }

  async findById(id: string): Promise<SafeUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT_FIELDS,
    });
  }

  // Incluye password — solo para uso interno de AuthService
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async update(id: string, dto: UpdateUserDto): Promise<SafeUser> {
    await this.ensureExists(id);
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: USER_SELECT_FIELDS,
    });
  }

  async remove(id: string): Promise<void> {
    await this.ensureExists(id);
    await this.prisma.user.delete({ where: { id } });
  }

  private async ensureExists(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Usuario con id ${id} no encontrado`);
    }
  }
}