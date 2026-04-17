// Guard reutilizable que decora cualquier endpoint que requiera auth.
// Retorna 401 automáticamente si el token es inválido/ausente.

import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}