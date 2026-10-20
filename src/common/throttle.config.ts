// Límite de peticiones (rate limiting) para todo el backend.
//
// Se cuenta por usuario y no por IP: en un colegio muchos estudiantes salen a
// internet con la misma IP, y un límite por IP los bloquearía a todos juntos.

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';

export const ONE_MINUTE_MS = 60_000;

/** Peticiones permitidas por minuto. */
export const THROTTLE_LIMITS = {
  /** Cualquier ruta sin límite propio. */
  default: 120,
  /** Login y registro (por correo): frena la prueba masiva de contraseñas. */
  auth: 10,
  /** Pedir el enlace de "olvidé mi contraseña" (por correo): cada petición envía un correo. */
  passwordResetRequest: 3,
  /** Chat vocacional: cada mensaje consume cuota de Gemini o Groq. */
  vocationalChat: 15,
  /** Subida del PDF del ICFES (hasta 8 MB cada uno). */
  icfesUpload: 10,
  /** Envío del test CHASIDE: dispara un análisis con IA. */
  chasideSubmit: 5,
} as const;

/** Atajo para @Throttle en una ruta: `@Throttle(perMinute(THROTTLE_LIMITS.auth))`. */
export function perMinute(limit: number) {
  return { default: { limit, ttl: ONE_MINUTE_MS } };
}

/** Lo que el limitador necesita leer de una petición de Express. */
type TrackedRequest = {
  headers?: { authorization?: unknown };
  body?: { email?: unknown };
  ip?: string;
};

export const THROTTLE_ERROR_MESSAGE =
  'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.';

/**
 * Identifica a quién se le cuentan las peticiones:
 * 1. Usuario con token válido → `user:<id>`.
 * 2. Login o registro (traen correo en el cuerpo) → `email:<correo>`.
 * 3. Cualquier otra petición → `ip:<ip>`.
 *
 * El limitador corre antes que JwtAuthGuard, por eso la firma del token se
 * verifica aquí: un token falso o vencido no cuenta como usuario, y así nadie
 * puede gastar el cupo de otra persona poniendo su id en un token inventado.
 */
export function createRequestTracker(jwtSecret: string) {
  const jwt = new JwtService({ secret: jwtSecret });

  return (req: TrackedRequest): string => {
    const authorization = req.headers?.authorization;
    if (
      typeof authorization === 'string' &&
      authorization.startsWith('Bearer ')
    ) {
      try {
        const payload = jwt.verify<{ sub?: unknown }>(authorization.slice(7));
        if (typeof payload.sub === 'string' && payload.sub) {
          return `user:${payload.sub}`;
        }
      } catch {
        // Token inválido o vencido: se limita como petición anónima.
      }
    }

    const email = req.body?.email;
    if (typeof email === 'string' && email.trim()) {
      return `email:${email.trim().toLowerCase()}`;
    }

    return `ip:${String(req.ip)}`;
  };
}

export function throttlerOptionsFactory(
  config: ConfigService,
): ThrottlerModuleOptions {
  return {
    throttlers: [
      { name: 'default', ttl: ONE_MINUTE_MS, limit: THROTTLE_LIMITS.default },
    ],
    errorMessage: THROTTLE_ERROR_MESSAGE,
    getTracker: createRequestTracker(config.getOrThrow<string>('JWT_SECRET')),
  };
}
