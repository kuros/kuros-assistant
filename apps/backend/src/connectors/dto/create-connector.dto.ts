import { IsIn, IsObject, IsString, MaxLength, MinLength } from 'class-validator';
import type { ConnectorKind, ConnectorConfig } from '@kuros/shared';

export class CreateConnectorDto {
  @IsString()
  @IsIn(['slack', 'outlook'])
  kind!: ConnectorKind;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsObject()
  config!: ConnectorConfig;
}
