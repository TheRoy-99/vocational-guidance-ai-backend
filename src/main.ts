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


  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`✅ Backend corriendo en puerto ${port}`);
}
bootstrap();