import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // El perfil adaptativo contiene evidencia estructurada. El cliente lo envía
  // compactado, pero mantenemos un margen explícito para evitar que el límite
  // por defecto de Express provoque errores 413 en evaluaciones largas.
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      process.env.FRONTEND_URL,
    ].filter(Boolean),
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
