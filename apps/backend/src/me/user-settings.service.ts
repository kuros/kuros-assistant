import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { UserSettingsEntity } from '../entities/user-settings.entity';
import type { AiProvider, ClaudeEffort, UserSettingsDto } from '@kuros/shared';

const DEFAULT_MODEL_FAST = 'claude-sonnet-4-6';
const DEFAULT_MODEL_DEEP = 'claude-opus-4-7';
const DEFAULT_EFFORT_FAST: ClaudeEffort = 'low';
const DEFAULT_EFFORT_DEEP: ClaudeEffort = 'high';
const DEFAULT_AI_PROVIDER: AiProvider = 'api';

@Injectable()
export class UserSettingsService {
  constructor(
    @InjectRepository(UserSettingsEntity)
    private readonly repo: Repository<UserSettingsEntity>,
  ) {}

  private toDto(row: UserSettingsEntity | null): UserSettingsDto {
    return {
      hasAnthropicKey: row?.anthropicApiKey != null && row.anthropicApiKey.length > 0,
      claudeModelFast: row?.claudeModelFast ?? DEFAULT_MODEL_FAST,
      claudeModelDeep: row?.claudeModelDeep ?? DEFAULT_MODEL_DEEP,
      claudeEffortFast: row?.claudeEffortFast ?? DEFAULT_EFFORT_FAST,
      claudeEffortDeep: row?.claudeEffortDeep ?? DEFAULT_EFFORT_DEEP,
      aiProvider: row?.aiProvider ?? DEFAULT_AI_PROVIDER,
    };
  }

  async get(userId: string): Promise<UserSettingsDto> {
    const row = await this.repo.findOne({ where: { userId } });
    return this.toDto(row);
  }

  async update(
    userId: string,
    dto: {
      anthropicApiKey?: string;
      claudeModelFast?: string;
      claudeModelDeep?: string;
      claudeEffortFast?: ClaudeEffort;
      claudeEffortDeep?: ClaudeEffort;
      aiProvider?: AiProvider;
    },
  ): Promise<UserSettingsDto> {
    let row = await this.repo.findOne({ where: { userId } });
    if (!row) {
      row = this.repo.create({
        userId,
        anthropicApiKey: null,
        claudeModelFast: null,
        claudeModelDeep: null,
        claudeEffortFast: null,
        claudeEffortDeep: null,
        aiProvider: DEFAULT_AI_PROVIDER,
      });
    }
    if (dto.anthropicApiKey != null) row.anthropicApiKey = dto.anthropicApiKey;
    if (dto.claudeModelFast != null) row.claudeModelFast = dto.claudeModelFast;
    if (dto.claudeModelDeep != null) row.claudeModelDeep = dto.claudeModelDeep;
    if (dto.claudeEffortFast != null) row.claudeEffortFast = dto.claudeEffortFast;
    if (dto.claudeEffortDeep != null) row.claudeEffortDeep = dto.claudeEffortDeep;
    if (dto.aiProvider != null) row.aiProvider = dto.aiProvider;
    await this.repo.save(row);
    return this.toDto(row);
  }

  async getRawApiKey(userId: string): Promise<string | null> {
    const row = await this.repo.findOne({ where: { userId } });
    return row?.anthropicApiKey ?? null;
  }

  async getProvider(userId: string): Promise<AiProvider> {
    const row = await this.repo.findOne({ where: { userId } });
    return row?.aiProvider ?? DEFAULT_AI_PROVIDER;
  }

  async testKey(userId: string, overrideKey?: string): Promise<{ ok: boolean; error?: string }> {
    const key = overrideKey ?? (await this.getRawApiKey(userId));
    if (!key) return { ok: false, error: 'No API key configured' };
    try {
      const client = new Anthropic({ apiKey: key });
      await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      });
      return { ok: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return { ok: false, error: msg };
    }
  }

  async getEffective(
    userId: string,
  ): Promise<{
    apiKey: string | null;
    modelFast: string;
    modelDeep: string;
    effortFast: ClaudeEffort;
    effortDeep: ClaudeEffort;
    aiProvider: AiProvider;
  }> {
    const row = await this.repo.findOne({ where: { userId } });
    return {
      apiKey: row?.anthropicApiKey ?? null,
      modelFast: row?.claudeModelFast ?? DEFAULT_MODEL_FAST,
      modelDeep: row?.claudeModelDeep ?? DEFAULT_MODEL_DEEP,
      effortFast: row?.claudeEffortFast ?? DEFAULT_EFFORT_FAST,
      effortDeep: row?.claudeEffortDeep ?? DEFAULT_EFFORT_DEEP,
      aiProvider: row?.aiProvider ?? DEFAULT_AI_PROVIDER,
    };
  }
}
