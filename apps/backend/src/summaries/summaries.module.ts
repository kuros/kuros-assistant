import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SummaryEntity } from '../entities/summary.entity';
import { ConnectorsModule } from '../connectors/connectors.module';
import { SummariesController } from './summaries.controller';
import { SummariesService } from './summaries.service';

@Module({
  imports: [TypeOrmModule.forFeature([SummaryEntity]), ConnectorsModule],
  controllers: [SummariesController],
  providers: [SummariesService],
  exports: [SummariesService],
})
export class SummariesModule {}
