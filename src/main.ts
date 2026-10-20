import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { Application } from 'express';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // En Render las peticiones llegan a través de su proxy: se confía solo en ese
  // primer salto para que req.ip sea la IP real del cliente (la usa el límite
  // de peticiones con las peticiones anónimas).
  (app.getHttpAdapter().getInstance() as Application).set('trust proxy', 1);

  // El perfil adaptativo contiene evidencia estructurada. El cliente lo envía
  // compactado, pero mantenemos un margen explícito para evitar que el límite
  // por defecto de Express provoque errores 413 en evaluaciones largas.
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));

  // En producción (NODE_ENV=production, definido en render.yaml) solo se acepta
  // el frontend publicado; los orígenes localhost quedan para desarrollo.
  const devOrigins =
    process.env.NODE_ENV === 'production'
      ? []
      : [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://localhost:3002',
        ];
  const allowedOrigins = [...devOrigins, process.env.FRONTEND_URL].filter(
    (origin): origin is string => Boolean(origin),
  );

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`✅ Backend corriendo en puerto ${port}`);
}
bootstrap();
