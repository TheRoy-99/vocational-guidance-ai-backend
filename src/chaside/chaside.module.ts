import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChasideController } from './chaside.controller';
import { ChasideService, CHASIDE_QUEUE } from './services/chaside.service';
import { ChasideScoringService } from './services/chaside-scoring.service';
import { ChasideAiService } from './services/chaside-ai.service';
import { ChasideProcessor } from './processors/chaside.processor';

@Module({
  imports: [
    BullModule.registerQueueAsync({
      name: CHASIDE_QUEUE,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),
  ],
  controllers: [ChasideController],
  providers: [
    ChasideService,
    ChasideScoringService,
    ChasideAiService,
    ChasideProcessor,
  ],
})
export class ChasideModule {}