import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  anthropicApiKey?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  claudeModelFast?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  claudeModelDeep?: string;
}
