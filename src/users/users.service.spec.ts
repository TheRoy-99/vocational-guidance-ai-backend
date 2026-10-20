import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import type { Requester } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

const student: Requester = { id: OWNER_ID, role: 'STUDENT' };
const admin: Requester = { id: OTHER_ID, role: 'ADMIN' };

describe('UsersService - control de acceso', () => {
  let user: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let service: UsersService;

  beforeEach(() => {
    user = {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue({ id: OWNER_ID }),
      update: jest.fn().mockResolvedValue({ id: OWNER_ID }),
      delete: jest.fn().mockResolvedValue({}),
    };
    service = new UsersService({ user } as unknown as PrismaService);
  });

  describe('listar usuarios', () => {
    it('rechaza a un estudiante', async () => {
      await expect(service.findAll(student)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(user.findMany).not.toHaveBeenCalled();
    });

    it('permite a un ADMIN', async () => {
      await service.findAll(admin);
      expect(user.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('ver, editar y borrar', () => {
    it.each([
      ['ver', (s: UsersService) => s.findOneFor(student, OTHER_ID)],
      [
        'editar',
        (s: UsersService) => s.update(student, OTHER_ID, { name: 'x' }),
      ],
      ['borrar', (s: UsersService) => s.remove(student, OTHER_ID)],
    ])(
      'impide %s la cuenta de otro usuario, sin consultar si existe',
      async (_accion, run) => {
        await expect(run(service)).rejects.toBeInstanceOf(ForbiddenException);
        expect(user.findUnique).not.toHaveBeenCalled();
        expect(user.update).not.toHaveBeenCalled();
        expect(user.delete).not.toHaveBeenCalled();
      },
    );

    it('permite al usuario ver, editar y borrar su propia cuenta', async () => {
      await service.findOneFor(student, OWNER_ID);
      await service.update(student, OWNER_ID, { name: 'Nuevo nombre' });
      await service.remove(student, OWNER_ID);

      expect(user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: OWNER_ID } }),
      );
      expect(user.delete).toHaveBeenCalledWith({ where: { id: OWNER_ID } });
    });

    it('permite a un ADMIN actuar sobre otra cuenta', async () => {
      await service.update(admin, OWNER_ID, { name: 'Corregido' });
      await service.remove(admin, OWNER_ID);

      expect(user.update).toHaveBeenCalledTimes(1);
      expect(user.delete).toHaveBeenCalledTimes(1);
    });

    it('responde 404 si el usuario pedido no existe (solo con permiso)', async () => {
      user.findUnique.mockResolvedValue(null);

      await expect(service.findOneFor(admin, OWNER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('cambio de correo', () => {
    it('guarda el correo en minúsculas y sin espacios', async () => {
      await service.update(student, OWNER_ID, { email: '  Ana@Example.COM ' });

      expect(user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { email: 'ana@example.com' } }),
      );
    });

    it('responde 409 si el correo ya es de otra cuenta', async () => {
      user.findFirst.mockResolvedValue({ id: OTHER_ID });

      await expect(
        service.update(student, OWNER_ID, { email: 'ocupado@example.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(user.update).not.toHaveBeenCalled();
    });

    it('permite volver a guardar el propio correo', async () => {
      user.findFirst.mockResolvedValue({ id: OWNER_ID });

      await service.update(student, OWNER_ID, { email: 'mio@example.com' });

      expect(user.update).toHaveBeenCalledTimes(1);
    });
  });
});
