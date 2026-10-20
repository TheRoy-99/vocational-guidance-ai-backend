import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { throttlerOptionsFactory } from './common/throttle.config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { ChasideModule } from './chaside/chaside.module';
import { IcfesModule } from './icfes/icfes.module';
import { FeedbackModule } from './feedback/feedback.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        redis: {
          host: process.env.REDIS_HOST ?? 'localhost',
          port: Number(process.env.REDIS_PORT ?? 6379),
        },
      }),
    }),
    PrismaModule,  // @Global() — PrismaService disponible en todo el árbol
    AuthModule,
    UsersModule,
    AssessmentsModule,
    ChasideModule,
    IcfesModule,
    FeedbackModule,
    ReportsModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: throttlerOptionsFactory,
    }),
  ],
  providers: [
    // Límite de peticiones en todas las rutas; ver common/throttle.config.ts.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
