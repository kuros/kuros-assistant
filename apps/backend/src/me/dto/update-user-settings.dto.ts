import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { AiProvider, ClaudeEffort } from '@kuros/shared';

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
  @IsIn(['low', 'medium', 'high'])
  claudeEffortFast?: ClaudeEffort;

  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  claudeEffortDeep?: ClaudeEffort;

  @IsOptional()
  @IsIn(['api', 'claude_code'])
  aiProvider?: AiProvider;
}
