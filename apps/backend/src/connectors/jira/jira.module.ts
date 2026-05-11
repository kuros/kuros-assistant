import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConnectorsModule } from '../connectors.module';
import { ConnectorEntity } from '../../entities/connector.entity';
import { JiraConnector } from './jira.connector';

@Module({
  imports: [ConnectorsModule, TypeOrmModule.forFeature([ConnectorEntity])],
  providers: [JiraConnector],
  exports: [JiraConnector],
})
export class JiraModule {}
