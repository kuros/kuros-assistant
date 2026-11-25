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
import { SlackModule } from './connectors/slack/slack.module';
import { OutlookModule } from './connectors/outlook/outlook.module';
import { OutlookPersonalModule } from './connectors/outlook-personal/outlook-personal.module';
import { JiraModule } from './connectors/jira/jira.module';
import { SummariesModule } from './summaries/summaries.module';
import { ActionItemsModule } from './action-items/action-items.module';
import { RisksModule } from './risks/risks.module';
import { PeopleTeamsModule } from './people-teams/people-teams.module';
import { InsightsModule } from './insights/insights.module';
import { MeModule } from './me/me.module';
import { EventsModule } from './events/summary-events';
import { KnowledgeModule } from './knowledge/knowledge.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    AuthModule,
    DatabaseModule,
    StorageModule,
    ClaudeModule,
    EventsModule,
    ScheduleModule.forRoot(),
    HealthModule,
    MeModule,
    ConnectorsModule,
    SlackModule,
    OutlookModule,
    OutlookPersonalModule,
    JiraModule,
    SummariesModule,
    ActionItemsModule,
    RisksModule,
    PeopleTeamsModule,
    InsightsModule,
    KnowledgeModule,
  ],
})
export class AppModule {}
