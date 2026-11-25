import { z } from 'zod';
import { clampedString, clampedArray } from '../../claude/prompts/schema-helpers';
import type { UserContext } from '../../claude/prompts/user-context';
import { formatTeams } from '../../claude/prompts/user-context';

const IMPORTANCE = ['high', 'medium', 'low'] as const;
const CATEGORY = ['decision', 'progress', 'blocker', 'people', 'announcement', 'request', 'other'] as const;

export const highlightsSchema = z.object({
  headline: clampedString(300, 1),
  highlights: clampedArray(
    z.object({
      title: clampedString(200, 1),
      detail: clampedString(800),
      importance: z.enum(IMPORTANCE),
      category: z.enum(CATEGORY),
      links: clampedArray(z.string(), 6).default([]),
    }),
    12,
  ),
  themes: clampedArray(clampedString(60), 8).default([]),
  people: clampedArray(
    z.object({ name: clampedString(120), page: z.string().nullable().optional(), note: clampedString(300) }),
    8,
  ).default([]),
  followUps: clampedArray(clampedString(300), 8).default([]),
});
export type HighlightsExtraction = z.infer<typeof highlightsSchema>;

export const highlightsPrompt = {
  toolName: 'record_daily_highlights',
  toolDescription: "Record the highlights of the user's day.",
  toolInputSchema: {
    type: 'object',
    required: ['headline', 'highlights'],
    properties: {
      headline: { type: 'string', maxLength: 300, description: 'One sentence: the single most important thing about the day.' },
      highlights: {
        type: 'array',
        maxItems: 12,
        description: 'Most important first. Merge duplicates reported by several sources.',
        items: {
          type: 'object',
          required: ['title', 'detail', 'importance', 'category'],
          properties: {
            title: { type: 'string', maxLength: 200 },
            detail: { type: 'string', maxLength: 800, description: 'May contain [[path|Label]] wiki links.' },
            importance: { type: 'string', enum: IMPORTANCE },
            category: { type: 'string', enum: CATEGORY },
            links: {
              type: 'array',
              maxItems: 6,
              items: { type: 'string' },
              description: 'Wiki page paths that back this highlight (sources and entity pages).',
            },
          },
        },
      },
      themes: { type: 'array', items: { type: 'string', maxLength: 60 }, maxItems: 8 },
      people: {
        type: 'array',
        maxItems: 8,
        description: 'People who featured notably today.',
        items: {
          type: 'object',
          required: ['name', 'note'],
          properties: {
            name: { type: 'string' },
            page: { type: ['string', 'null'], description: 'people/<slug> if a page exists.' },
            note: { type: 'string', maxLength: 300 },
          },
        },
      },
      followUps: {
        type: 'array',
        maxItems: 8,
        items: { type: 'string', maxLength: 300 },
        description: 'Concrete things the user should follow up on tomorrow.',
      },
    },
  } as const,

  system: (userCtx: UserContext): string =>
    `You write the end-of-day highlights for ${userCtx.name}. Their teams: ${formatTeams(userCtx)}.
Rank by what matters to ${userCtx.name}: decisions, blockers and risks affecting them or their teams come first, then
meaningful progress, then announcements. Skip noise. Merge the same event reported in several sources into one
highlight. Only use page paths that appear in the supplied material.`,

  user: (args: {
    date: string;
    sources: string;
    entityPages: string;
    actionItems: string;
    risks: string;
  }): string => `Date: ${args.date}

<source_pages>
${args.sources}
</source_pages>

<related_entity_pages>
${args.entityPages || '(none)'}
</related_entity_pages>

<action_items_extracted_today>
${args.actionItems || '(none)'}
</action_items_extracted_today>

<risks_extracted_today>
${args.risks || '(none)'}
</risks_extracted_today>`,
};
