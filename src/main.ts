import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
