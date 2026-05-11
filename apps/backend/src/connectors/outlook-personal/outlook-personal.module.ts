import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConnectorsModule } from '../connectors.module';
import { ConnectorEntity } from '../../entities/connector.entity';
import { OutlookPersonalConnector } from './outlook-personal.connector';
import { OutlookPersonalAuthService } from './outlook-personal.auth';

@Module({
  imports: [ConnectorsModule, TypeOrmModule.forFeature([ConnectorEntity])],
  providers: [OutlookPersonalConnector, OutlookPersonalAuthService],
  exports: [OutlookPersonalConnector, OutlookPersonalAuthService],
})
export class OutlookPersonalModule {}
