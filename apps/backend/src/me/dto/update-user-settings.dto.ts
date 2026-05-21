import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { AiProvider } from '@kuros/shared';

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

  @IsOptional()
  @IsIn(['api', 'claude_code'])
  aiProvider?: AiProvider;
}
