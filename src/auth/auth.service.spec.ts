import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import {
  AuthService,
  FORGOT_PASSWORD_MESSAGE,
  INVALID_RESET_LINK_MESSAGE,
} from './auth.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';

// Valores de prueba sin forma de secreto real (los escáneres como GitGuardian
// marcan textos con forma de hash bcrypt o literales asignados a "password").
const JWT_SECRET = 'secreto-de-prueba';
const STORED_HASH = 'hash-guardado-de-prueba';
const STORED_HASH_AFTER_CHANGE = 'hash-guardado-despues-del-cambio';
const NEW_PLAIN_TEXT = 'NuevaClave123';
const OTHER_PLAIN_TEXT = 'OtraClave123';

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ana',
  email: 'ana@correo.com',
  password: STORED_HASH,
  role: 'STUDENT',
};

describe('AuthService - restablecer contraseña', () => {
  let jwtService: JwtService;
  let usersService: {
    findByEmail: jest.Mock;
    findByIdWithPassword: jest.Mock;
    updatePassword: jest.Mock;
  };
  let mailService: { sendPasswordReset: jest.Mock };
  let service: AuthService;

  const config = {
    get: (key: string) =>
      key === 'FRONTEND_URL' ? 'https://orientaai.example/' : undefined,
    getOrThrow: () => JWT_SECRET,
  } as unknown as ConfigService;

  // Pide el enlace y devuelve el token que se habría enviado por correo.
  const requestResetToken = async () => {
    await service.forgotPassword({ email: USER.email });
    const [, , resetUrl] = mailService.sendPasswordReset.mock.calls[0] as [
      string,
      string,
      string,
    ];
    return new URL(resetUrl).searchParams.get('token')!;
  };

  beforeEach(() => {
    jwtService = new JwtService({ secret: JWT_SECRET });
    usersService = {
      findByEmail: jest.fn().mockResolvedValue(USER),
      findByIdWithPassword: jest.fn().mockResolvedValue(USER),
      updatePassword: jest.fn().mockResolvedValue(undefined),
    };
    mailService = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };
    service = new AuthService(
      usersService as unknown as UsersService,
      jwtService,
      mailService as unknown as MailService,
      config,
    );
  });

  describe('forgotPassword', () => {
    it('envía un enlace al frontend con el token, al correo de la cuenta', async () => {
      const result = await service.forgotPassword({
        email: ' Ana@Correo.com ',
      });

      expect(result).toEqual({ message: FORGOT_PASSWORD_MESSAGE });
      expect(usersService.findByEmail).toHaveBeenCalledWith('ana@correo.com');
      const [to, , resetUrl, minutes] = mailService.sendPasswordReset.mock
        .calls[0] as [string, string, string, number];
      expect(to).toBe(USER.email);
      expect(resetUrl).toMatch(
        /^https:\/\/orientaai\.example\/login\/reset-password\?token=/,
      );
      expect(minutes).toBe(30);
    });

    it('responde lo mismo si el correo no existe, sin enviar nada', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await service.forgotPassword({
        email: 'nadie@correo.com',
      });

      expect(result).toEqual({ message: FORGOT_PASSWORD_MESSAGE });
      expect(mailService.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('no falla si el envío del correo falla', async () => {
      mailService.sendPasswordReset.mockRejectedValue(new Error('SMTP caído'));

      await expect(
        service.forgotPassword({ email: USER.email }),
      ).resolves.toEqual({ message: FORGOT_PASSWORD_MESSAGE });
    });
  });

  describe('resetPassword', () => {
    it('cambia la contraseña con un enlace válido', async () => {
      const token = await requestResetToken();

      await service.resetPassword({ token, password: NEW_PLAIN_TEXT });

      const [id, hashed] = usersService.updatePassword.mock.calls[0] as [
        string,
        string,
      ];
      expect(id).toBe(USER.id);
      await expect(bcrypt.compare(NEW_PLAIN_TEXT, hashed)).resolves.toBe(true);
    });

    it('rechaza reutilizar el enlace después de cambiar la contraseña', async () => {
      const token = await requestResetToken();
      // La contraseña ya cambió: el hash guardado es otro.
      usersService.findByIdWithPassword.mockResolvedValue({
        ...USER,
        password: STORED_HASH_AFTER_CHANGE,
      });

      await expect(
        service.resetPassword({ token, password: OTHER_PLAIN_TEXT }),
      ).rejects.toThrow(INVALID_RESET_LINK_MESSAGE);
      expect(usersService.updatePassword).not.toHaveBeenCalled();
    });

    it('rechaza un enlace vencido', async () => {
      const expired = jwtService.sign(
        { sub: USER.id, purpose: 'password-reset' },
        { secret: `${JWT_SECRET}:${USER.password}`, expiresIn: -10 },
      );

      await expect(
        service.resetPassword({ token: expired, password: NEW_PLAIN_TEXT }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza un token de sesión normal usado como enlace', async () => {
      const sessionToken = jwtService.sign({ sub: USER.id, role: 'STUDENT' });

      await expect(
        service.resetPassword({
          token: sessionToken,
          password: NEW_PLAIN_TEXT,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza texto que no es un token', async () => {
      await expect(
        service.resetPassword({
          token: 'no-es-un-token',
          password: NEW_PLAIN_TEXT,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('el enlace no sirve como token de sesión', async () => {
      const token = await requestResetToken();

      // JwtStrategy verifica las sesiones solo con JWT_SECRET.
      expect(() => {
        jwtService.verify(token);
      }).toThrow();
    });
  });
});
