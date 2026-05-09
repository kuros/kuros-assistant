import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { z, ZodSchema } from 'zod';
import { ClaudeClientFactory } from './claude-client.factory';

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
  private readonly logger = new Logger(ClaudeService.name);

  constructor(private readonly factory: ClaudeClientFactory) {}

  async summarize(
    userId: string,
    args: SummarizeArgs,
  ): Promise<{ text: string; modelUsed: string }> {
    const { client, modelFast, modelDeep } = await this.factory.getContext(userId);
    const model = args.model === 'deep' ? modelDeep : modelFast;
    try {
      const response = await client.messages.create({
        model,
        max_tokens: args.maxTokens ?? (args.model === 'deep' ? 8192 : 4096),
        system: [
          { type: 'text', text: args.system, cache_control: { type: 'ephemeral' } } as Anthropic.TextBlockParam,
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

  async extractStructured<T>(
    userId: string,
    args: ExtractStructuredArgs<T>,
  ): Promise<{ data: T; modelUsed: string }> {
    const { client, modelFast, modelDeep } = await this.factory.getContext(userId);
    const model = args.model === 'deep' ? modelDeep : modelFast;
    try {
      const response = await client.messages.create({
        model,
        max_tokens: args.maxTokens ?? 2048,
        system: [
          { type: 'text', text: args.system, cache_control: { type: 'ephemeral' } } as Anthropic.TextBlockParam,
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
        this.logger.warn(
          `Tool input failed schema: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        );
        throw new Error('Claude tool input did not match schema');
      }
      return { data: parsed.data, modelUsed: model };
    } catch (err) {
      this.logger.error(`Claude extractStructured failed: ${err instanceof Error ? err.message : err}`);
      throw new InternalServerErrorException('Claude extractStructured failed');
    }
  }
}
