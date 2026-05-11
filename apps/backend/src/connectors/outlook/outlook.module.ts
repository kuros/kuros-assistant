import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConnectorsModule } from '../connectors.module';
import { ConnectorEntity } from '../../entities/connector.entity';
import { OutlookConnector } from './outlook.connector';
import { OutlookAuthService } from './outlook.auth';

@Module({
  imports: [ConnectorsModule, TypeOrmModule.forFeature([ConnectorEntity])],
  providers: [OutlookConnector, OutlookAuthService],
  exports: [OutlookConnector, OutlookAuthService],
})
export class OutlookModule {}
