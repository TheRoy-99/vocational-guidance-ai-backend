import { Module } from '@nestjs/common';
import { IcfesModule } from '../icfes/icfes.module';
import { AuditController } from './audit.controller';

@Module({
  imports: [IcfesModule],
  controllers: [AuditController],
})
export class AuditModule {}
