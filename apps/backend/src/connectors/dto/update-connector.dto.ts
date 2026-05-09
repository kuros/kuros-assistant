import { IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { ConnectorStatus, ConnectorConfig } from '@kuros/shared';

export class UpdateConnectorDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'paused', 'error'])
  status?: ConnectorStatus;

  @IsOptional()
  @IsObject()
  config?: Partial<ConnectorConfig>;
}
