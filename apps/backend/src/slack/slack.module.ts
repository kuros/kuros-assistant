import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConnectorsModule } from '../connectors/connectors.module';
import { ConnectorEntity } from '../entities/connector.entity';
import { SlackConnector } from './slack.connector';

@Module({
  imports: [ConnectorsModule, TypeOrmModule.forFeature([ConnectorEntity])],
  providers: [SlackConnector],
  exports: [SlackConnector],
})
export class SlackModule {}
