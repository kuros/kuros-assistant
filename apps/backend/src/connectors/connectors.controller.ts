import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type {
  ConnectorDto,
  TestConnectorResponse,
  SyncConnectorResponse,
} from '@kuros/shared';
import { CurrentUser, AuthenticatedUser } from '../common/auth/current-user.decorator';
import { ConnectorsService } from './connectors.service';
import { ConnectorRegistry } from './connector.registry';
import { ConnectorSchedulerService } from './connector-scheduler.service';
import { CreateConnectorDto } from './dto/create-connector.dto';
import { UpdateConnectorDto } from './dto/update-connector.dto';
import { TriggerSyncDto } from './dto/trigger-sync.dto';

@Controller('api/connectors')
export class ConnectorsController {
  constructor(
    private readonly service: ConnectorsService,
    private readonly registry: ConnectorRegistry,
    private readonly scheduler: ConnectorSchedulerService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<ConnectorDto[]> {
    return this.service.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateConnectorDto,
  ): Promise<ConnectorDto> {
    return this.service.create(user.id, dto);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConnectorDto> {
    return this.service.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConnectorDto,
  ): Promise<ConnectorDto> {
    return this.service.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.service.remove(user.id, id);
  }

  @Post(':id/test')
  async test(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TestConnectorResponse> {
    const row = await this.service.getRaw(user.id, id);
    const connector = this.registry.get(row.kind);
    return connector.test(row.id);
  }

  @Post('sync')
  async syncAll(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SyncConnectorResponse> {
    const rows = await this.service.listRaw(user.id);
    let queued = 0;
    for (const row of rows.filter((r) => r.status === 'active')) {
      queued += await this.scheduler.runSyncForConnector(row);
    }
    return { queued };
  }

  @Post(':id/sync')
  async sync(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TriggerSyncDto,
  ): Promise<SyncConnectorResponse> {
    const row = await this.service.getRaw(user.id, id);
    const queued = await this.scheduler.runSyncForConnector(row, dto.targetId);
    return { queued };
  }
}
