// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api/v1');  // ← esta línea debe estar

  await app.listen(process.env.PORT ?? 3000);
  console.log(`ORIENTA API corriendo en: ${await app.getUrl()}/api/v1`);
  // Habilitar CORS para comunicación frontend-backend
  app.enableCors({
    origin: [
      'http://localhost:3000',      // Desarrollo local
      'http://localhost:3001',      // Desarrollo local alternativo
      'http://localhost:3002',      // Docker
      process.env.FRONTEND_URL,      // Variable de entorno para otros orígenes
    ].filter(Boolean), // Filtrar valores undefined/null
    credentials: true,               // Permitir cookies
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe());

  // Prefijo global de API
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`✅ Backend corriendo en puerto ${port}`);
}
bootstrap();