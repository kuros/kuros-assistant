import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config/config.module';
import { LoggerModule } from './common/logging/logger.module';
import { AuthModule } from './common/auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { StorageModule } from './storage/storage.module';
import { ClaudeModule } from './claude/claude.module';
import { HealthModule } from './health/health.module';
import { ConnectorsModule } from './connectors/connectors.module';
import { SlackModule } from './slack/slack.module';
import { OutlookModule } from './outlook/outlook.module';
import { SummariesModule } from './summaries/summaries.module';
import { ActionItemsModule } from './action-items/action-items.module';
import { RisksModule } from './risks/risks.module';
import { PeopleTeamsModule } from './people-teams/people-teams.module';
import { InsightsModule } from './insights/insights.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    AuthModule,
    DatabaseModule,
    StorageModule,
    ClaudeModule,
    ScheduleModule.forRoot(),
    HealthModule,
    ConnectorsModule,
    SlackModule,
    OutlookModule,
    SummariesModule,
    ActionItemsModule,
    RisksModule,
    PeopleTeamsModule,
    InsightsModule,
  ],
})
export class AppModule {}
