import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const model = process.env.CLAUDE_MODEL_FAST ?? 'claude-sonnet-4-6';
  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model,
    max_tokens: 256,
    messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
  });
  const text = r.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  // eslint-disable-next-line no-console
  console.log(`Claude (${model}) replied: ${text}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
