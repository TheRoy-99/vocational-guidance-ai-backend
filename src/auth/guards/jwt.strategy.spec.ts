import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { UsersService } from '../../users/users.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('JwtStrategy.validate', () => {
  let findById: jest.Mock;
  let strategy: JwtStrategy;

  beforeEach(() => {
    findById = jest.fn();
    strategy = new JwtStrategy(
      { get: () => 'secreto-de-prueba' } as unknown as ConfigService,
      { findById } as unknown as UsersService,
    );
  });

  it('usa el rol y el correo actuales de la base, no los del token', async () => {
    findById.mockResolvedValue({
      id: USER_ID,
      email: 'nuevo@example.com',
      role: 'STUDENT',
    });

    const user = await strategy.validate({
      sub: USER_ID,
      email: 'viejo@example.com',
      role: 'ADMIN',
    });

    expect(user).toEqual({
      id: USER_ID,
      email: 'nuevo@example.com',
      role: 'STUDENT',
    });
  });

  it('rechaza el token si el usuario ya no existe', async () => {
    findById.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: USER_ID, email: 'x@example.com', role: 'ADMIN' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
