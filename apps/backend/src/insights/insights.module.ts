import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InsightEntity } from '../entities/insight.entity';
import { SummaryEntity } from '../entities/summary.entity';
import { PersonEntity } from '../entities/person.entity';
import { TeamEntity } from '../entities/team.entity';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

@Module({
  imports: [TypeOrmModule.forFeature([InsightEntity, SummaryEntity, PersonEntity, TeamEntity])],
  controllers: [InsightsController],
  providers: [InsightsService],
})
export class InsightsModule {}
