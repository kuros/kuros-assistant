import { z } from 'zod';
import type { UserContext } from './user-context';
import { formatTeams } from './user-context';

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
    'Record concrete, actionable items from a summary, prioritising those owned by the user or their teams.',
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

  system: (userCtx: UserContext): string => {
    const teams = formatTeams(userCtx);
    return `Extract concrete, actionable items from the supplied summary that ${userCtx.name} or any member of their teams is responsible for.
The user is ${userCtx.name}; their teams are: ${teams}.

Rules:
- Only include items where the owner is ${userCtx.name} or a named member of their teams. Skip everything else.
- An action item must have a clear verb, a clear object, and be owned by one of the above people. Skip vague aspirations.
- If there are no qualifying action items, return { items: [] }.`;
  },

  user: (args: { sourceLabel: string; period: string; summaryMarkdown: string }): string =>
    `Summary source: ${args.sourceLabel}, ${args.period}.\n\n${args.summaryMarkdown}`,
};
