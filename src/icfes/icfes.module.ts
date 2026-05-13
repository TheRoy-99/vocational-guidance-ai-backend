import { Module } from '@nestjs/common';
import { IcfesController } from './icfes.controller';
import { IcfesService } from './icfes.service';

@Module({
  controllers: [IcfesController],
  providers: [IcfesService],
  exports: [IcfesService],
})
export class IcfesModule {}