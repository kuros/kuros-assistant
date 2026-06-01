import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { ZodSchema } from 'zod';
import { ClaudeClientFactory } from './claude-client.factory';
import { ClaudeCodeRunner } from './claude-code.runner';

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

  constructor(
    private readonly factory: ClaudeClientFactory,
    private readonly claudeCode: ClaudeCodeRunner,
  ) {}

  async summarize(
    userId: string,
    args: SummarizeArgs,
  ): Promise<{ text: string; modelUsed: string }> {
    const ctx = await this.factory.getContext(userId);
    const isDeep = args.model === 'deep';
    const model = isDeep ? ctx.modelDeep : ctx.modelFast;
    const effort = isDeep ? ctx.effortDeep : ctx.effortFast;

    if (ctx.provider === 'claude_code') {
      try {
        const text = await this.claudeCode.runText({ system: args.system, user: args.user, model, effort });
        return { text, modelUsed: `claude-code:${model}` };
      } catch (err) {
        this.logger.error(`Claude Code summarize failed: ${err instanceof Error ? err.message : err}`);
        throw err instanceof InternalServerErrorException
          ? err
          : new InternalServerErrorException('Claude Code summarize failed');
      }
    }

    const client = ctx.client!;
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
    const ctx = await this.factory.getContext(userId);
    const isDeep = args.model === 'deep';
    const model = isDeep ? ctx.modelDeep : ctx.modelFast;
    const effort = isDeep ? ctx.effortDeep : ctx.effortFast;

    if (ctx.provider === 'claude_code') {
      try {
        const schemaForPrompt = JSON.stringify(args.toolInputSchema, null, 2);
        const systemWithSchema =
          `${args.system}\n\n` +
          `You must output a JSON object that conforms to the following JSON schema:\n` +
          `\`\`\`json\n${schemaForPrompt}\n\`\`\``;
        const raw = await this.claudeCode.runJson({
          system: systemWithSchema,
          user: args.user,
          model,
          effort,
        });
        const parsed = args.schema.safeParse(raw);
        if (!parsed.success) {
          this.logger.warn(
            `Claude Code tool output failed schema: ${parsed.error.issues
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join(', ')}`,
          );
          throw new Error('Claude Code output did not match schema');
        }
        return { data: parsed.data, modelUsed: `claude-code:${model}` };
      } catch (err) {
        this.logger.error(`Claude Code extractStructured failed: ${err instanceof Error ? err.message : err}`);
        throw err instanceof InternalServerErrorException
          ? err
          : new InternalServerErrorException('Claude Code extractStructured failed');
      }
    }

    const client = ctx.client!;
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
