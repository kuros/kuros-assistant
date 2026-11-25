import { z } from 'zod';
import { clampedString } from './schema-helpers';
import type { UserContext } from './user-context';
import { formatTeams } from './user-context';

/** Action items and risks in one call (they used to be two calls over the same summary). */
export const extractionSchema = z.object({
  actionItems: z.array(
    z.object({
      title: clampedString(200),
      detail: clampedString(1000).optional(),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }),
  ),
  risks: z.array(
    z.object({
      title: clampedString(200),
      detail: clampedString(1000).optional(),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
    }),
  ),
});

export type Extraction = z.infer<typeof extractionSchema>;

export const extractionPrompt = {
  toolName: 'record_action_items_and_risks',
  toolDescription:
    'Record the action items owned by the user or their teams, and the risks that could affect them, from a summary.',
  toolInputSchema: {
    type: 'object',
    required: ['actionItems', 'risks'],
    properties: {
      actionItems: {
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
      risks: {
        type: 'array',
        items: {
          type: 'object',
          required: ['title', 'severity'],
          properties: {
            title: { type: 'string', maxLength: 200 },
            detail: { type: 'string', maxLength: 1000 },
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          },
        },
      },
    },
  } as const,

  system: (userCtx: UserContext): string => {
    const teams = formatTeams(userCtx);
    return `From the supplied summary, extract (1) action items and (2) risks for ${userCtx.name}.
The user is ${userCtx.name}; their teams are: ${teams}.

Action items:
- Only include items owned by ${userCtx.name} or a named member of their teams. Skip everything else.
- An action item must have a clear verb, a clear object, and be owned by one of the above people. Skip vague aspirations.

Risks:
- Only record risks whose impact falls on ${userCtx.name} or a member/deliverable of their teams; also include risks with
  broader business or project impact that ${userCtx.name} should be aware of. Skip risks that affect unrelated parties only.
- A risk must be a plausible future negative event with non-trivial impact. Do not flag low-impact annoyances.

Return empty arrays when nothing qualifies.`;
  },

  user: (args: { sourceLabel: string; period: string; summaryMarkdown: string }): string =>
    `Summary source: ${args.sourceLabel}, ${args.period}.\n\n${args.summaryMarkdown}`,
};
