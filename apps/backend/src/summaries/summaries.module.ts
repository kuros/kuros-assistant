import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SummaryEntity } from '../entities/summary.entity';
import { ConnectorEntity } from '../entities/connector.entity';
import { UserEntity } from '../entities/user.entity';
import { ConnectorsModule } from '../connectors/connectors.module';
import { SummariesController } from './summaries.controller';
import { SummariesService } from './summaries.service';
import { SummaryBackfillService } from './summary-backfill.service';

@Module({
  imports: [TypeOrmModule.forFeature([SummaryEntity, ConnectorEntity, UserEntity]), ConnectorsModule],
  controllers: [SummariesController],
  providers: [SummariesService, SummaryBackfillService],
  exports: [SummariesService],
})
export class SummariesModule {}
