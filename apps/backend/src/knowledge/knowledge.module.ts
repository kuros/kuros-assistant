import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SummaryEntity } from '../entities/summary.entity';
import { ConnectorEntity } from '../entities/connector.entity';
import { ActionItemEntity } from '../entities/action-item.entity';
import { RiskEntity } from '../entities/risk.entity';
import { WikiIngestionEntity } from '../entities/wiki-ingestion.entity';
import { ChatConversationEntity } from '../entities/chat-conversation.entity';
import { ChatMessageEntity } from '../entities/chat-message.entity';
import { ConnectorsModule } from '../connectors/connectors.module';
import { WikiStore } from './wiki-store';
import { WikiIngestService } from './wiki-ingest.service';
import { HighlightsService } from './highlights.service';
import { KnowledgeChatService } from './knowledge-chat.service';
import { KnowledgeController } from './knowledge.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SummaryEntity,
      ConnectorEntity,
      ActionItemEntity,
      RiskEntity,
      WikiIngestionEntity,
      ChatConversationEntity,
      ChatMessageEntity,
    ]),
    ConnectorsModule,
  ],
  controllers: [KnowledgeController],
  providers: [WikiStore, WikiIngestService, HighlightsService, KnowledgeChatService],
})
export class KnowledgeModule {}
