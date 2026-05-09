import { z } from 'zod';

export const actionItemsSchema = z.object({
  items: z.array(
    z.object({
      title: z.string().max(200),
      detail: z.string().max(1000).optional(),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }),
  ),
});

export type ActionItemsExtraction = z.infer<typeof actionItemsSchema>;

export const actionItemsPrompt = {
  toolName: 'record_action_items',
  toolDescription:
    'Record concrete, actionable items the user is responsible for from a summary.',
  toolInputSchema: {
    type: 'object',
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string', maxLength: 200 },
            detail: { type: 'string', maxLength: 1000 },
            dueDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          },
        },
      },
    },
  } as const,

  system: `Extract concrete, actionable items the user is responsible for, from the supplied summary. An action item must have a clear verb, a clear object, and be something the user (not someone else) needs to do. Skip vague aspirations. If there are no action items, return { items: [] }.`,

  user: (args: { sourceLabel: string; period: string; summaryMarkdown: string }): string =>
    `Summary source: ${args.sourceLabel}, ${args.period}.\n\n${args.summaryMarkdown}`,
};
