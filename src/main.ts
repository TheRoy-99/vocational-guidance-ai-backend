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
}
bootstrap();