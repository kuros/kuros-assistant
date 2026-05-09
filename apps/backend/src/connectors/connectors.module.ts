import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConnectorEntity } from '../entities/connector.entity';
import { ConnectorSyncStateEntity } from '../entities/connector-sync-state.entity';
import { ActionItemEntity } from '../entities/action-item.entity';
import { RiskEntity } from '../entities/risk.entity';
import { SummaryEntity } from '../entities/summary.entity';
import { UserEntity } from '../entities/user.entity';
import { MeModule } from '../me/me.module';
import { ConnectorsController } from './connectors.controller';
import { ConnectorsService } from './connectors.service';
import { ConnectorRegistry } from './connector.registry';
import { ConnectorSchedulerService } from './connector-scheduler.service';
import { PostSummaryPipeline } from './post-summary.pipeline';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConnectorEntity,
      ConnectorSyncStateEntity,
      ActionItemEntity,
      RiskEntity,
      SummaryEntity,
      UserEntity,
    ]),
    MeModule,
  ],
  controllers: [ConnectorsController],
  providers: [ConnectorsService, ConnectorRegistry, ConnectorSchedulerService, PostSummaryPipeline],
  exports: [ConnectorsService, ConnectorRegistry, ConnectorSchedulerService, PostSummaryPipeline],
})
export class ConnectorsModule {}
