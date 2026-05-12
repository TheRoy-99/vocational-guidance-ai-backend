import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ChasideModule } from './chaside/chaside.module';
import { AssessmentsModule } from './assessments/assessments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,  // @Global() — PrismaService disponible en todo el árbol
    AuthModule,
    UsersModule,
    ChasideModule,
    AssessmentsModule,
  ],
})
export class AppModule {}