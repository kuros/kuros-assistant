import { z } from 'zod';

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
  toolDescription: 'Record risks surfaced in a summary.',
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

  system: `Identify risks surfaced in the supplied summary. A risk is a future negative event that could plausibly occur, with a non-trivial impact on the user, their team, or the business. Do not flag low-impact annoyances. If there are no risks, return { risks: [] }.`,

  user: (args: { sourceLabel: string; period: string; summaryMarkdown: string }): string =>
    `Summary source: ${args.sourceLabel}, ${args.period}.\n\n${args.summaryMarkdown}`,
};
