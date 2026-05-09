import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { z, ZodSchema } from 'zod';

export type ClaudeModelTier = 'fast' | 'deep';

export interface SummarizeArgs {
  system: string;
  user: string;
  model?: ClaudeModelTier;
  maxTokens?: number;
}

export interface ExtractStructuredArgs<T> {
  system: string;
  user: string;
  schema: ZodSchema<T>;
  toolName: string;
  toolDescription: string;
  toolInputSchema: Record<string, unknown>;
  model?: ClaudeModelTier;
  maxTokens?: number;
}

@Injectable()
export class ClaudeService {
  private readonly client: Anthropic;
  private readonly logger = new Logger(ClaudeService.name);
  private readonly modelFast: string;
  private readonly modelDeep: string;

  constructor(cfg: ConfigService) {
    const apiKey = cfg.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
    this.client = new Anthropic({ apiKey });
    this.modelFast = cfg.get<string>('CLAUDE_MODEL_FAST') ?? 'claude-sonnet-4-6';
    this.modelDeep = cfg.get<string>('CLAUDE_MODEL_DEEP') ?? 'claude-opus-4-7';
  }

  private modelFor(tier: ClaudeModelTier | undefined): string {
    return tier === 'deep' ? this.modelDeep : this.modelFast;
  }

  async summarize(args: SummarizeArgs): Promise<{ text: string; modelUsed: string }> {
    const model = this.modelFor(args.model);
    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: args.maxTokens ?? (args.model === 'deep' ? 8192 : 4096),
        system: [
          { type: 'text', text: args.system, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: args.user }],
      });
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      return { text, modelUsed: model };
    } catch (err) {
      this.logger.error(`Claude summarize failed: ${err instanceof Error ? err.message : err}`);
      throw new InternalServerErrorException('Claude summarize failed');
    }
  }

  async extractStructured<T>(args: ExtractStructuredArgs<T>): Promise<{ data: T; modelUsed: string }> {
    const model = this.modelFor(args.model);
    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: args.maxTokens ?? 2048,
        system: [
          { type: 'text', text: args.system, cache_control: { type: 'ephemeral' } },
        ],
        tools: [
          {
            name: args.toolName,
            description: args.toolDescription,
            input_schema: args.toolInputSchema as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: args.toolName },
        messages: [{ role: 'user', content: args.user }],
      });
      const toolUse = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === args.toolName,
      );
      if (!toolUse) {
        throw new Error('Claude did not return a tool_use block');
      }
      const parsed = args.schema.safeParse(toolUse.input);
      if (!parsed.success) {
        this.logger.warn(`Tool input failed schema: ${z.prettifyError ? z.prettifyError(parsed.error) : parsed.error.message}`);
        throw new Error(`Claude tool input did not match schema`);
      }
      return { data: parsed.data, modelUsed: model };
    } catch (err) {
      this.logger.error(`Claude extractStructured failed: ${err instanceof Error ? err.message : err}`);
      throw new InternalServerErrorException('Claude extractStructured failed');
    }
  }
}
