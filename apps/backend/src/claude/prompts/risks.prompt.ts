import { z } from 'zod';
import type { UserContext } from './user-context';
import { formatTeams } from './user-context';

export const risksSchema = z.object({
  risks: z.array(
    z.object({
      title: z.string().max(200),
      detail: z.string().max(1000).optional(),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
    }),
  ),
});

export type RisksExtraction = z.infer<typeof risksSchema>;

export const risksPrompt = {
  toolName: 'record_risks',
  toolDescription: 'Record risks surfaced in a summary, prioritising those that affect the user or their teams.',
  toolInputSchema: {
    type: 'object',
    required: ['risks'],
    properties: {
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
    return `Identify risks from the supplied summary that could directly affect ${userCtx.name} or any of their teams.
The user is ${userCtx.name}; their teams are: ${teams}.

Rules:
- Only record risks where the impact falls on ${userCtx.name} or a member/deliverable of ${userCtx.teams} teams. Skip risks that affect unrelated parties only.
- Also capture risks with broader business or project impact that ${userCtx.name} should be aware of.
- A risk must be a plausible future negative event with non-trivial impact. Do not flag low-impact annoyances.
- If there are no qualifying risks, return { risks: [] }.`;
  },

  user: (args: { sourceLabel: string; period: string; summaryMarkdown: string }): string =>
    `Summary source: ${args.sourceLabel}, ${args.period}.\n\n${args.summaryMarkdown}`,
};
