import { BadRequestException, Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { UserSettingsService } from '../me/user-settings.service';
import type { AiProvider, ClaudeEffort } from '@kuros/shared';

export interface ClaudeContext {
  provider: AiProvider;
  client: Anthropic | null;
  modelFast: string;
  modelDeep: string;
  effortFast: ClaudeEffort;
  effortDeep: ClaudeEffort;
}

@Injectable()
export class ClaudeClientFactory {
  constructor(private readonly userSettings: UserSettingsService) {}

  async getContext(userId: string): Promise<ClaudeContext> {
    const { apiKey, modelFast, modelDeep, effortFast, effortDeep, aiProvider } =
      await this.userSettings.getEffective(userId);
    if (aiProvider === 'api') {
      if (!apiKey) {
        throw new BadRequestException('Anthropic API key not configured — set it in AI Settings');
      }
      return { provider: 'api', client: new Anthropic({ apiKey }), modelFast, modelDeep, effortFast, effortDeep };
    }
    return { provider: 'claude_code', client: null, modelFast, modelDeep, effortFast, effortDeep };
  }
}
