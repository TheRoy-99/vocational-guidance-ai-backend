import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { ChasideModule } from './chaside/chaside.module';
import { IcfesModule } from './icfes/icfes.module';
import { FeedbackModule } from './feedback/feedback.module';

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
  ],
})
export class AppModule {}