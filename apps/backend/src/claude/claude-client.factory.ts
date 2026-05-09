import { BadRequestException, Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { UserSettingsService } from '../me/user-settings.service';

export interface ClaudeContext {
  client: Anthropic;
  modelFast: string;
  modelDeep: string;
}

@Injectable()
export class ClaudeClientFactory {
  constructor(private readonly userSettings: UserSettingsService) {}

  async getContext(userId: string): Promise<ClaudeContext> {
    const { apiKey, modelFast, modelDeep } = await this.userSettings.getEffective(userId);
    if (!apiKey) {
      throw new BadRequestException('Anthropic API key not configured — set it in AI Settings');
    }
    return { client: new Anthropic({ apiKey }), modelFast, modelDeep };
  }
}
