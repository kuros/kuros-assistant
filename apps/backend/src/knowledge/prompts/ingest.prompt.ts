import { z } from 'zod';
import { clampedString, clampedArray } from '../../claude/prompts/schema-helpers';
import type { UserContext } from '../../claude/prompts/user-context';
import { formatTeams } from '../../claude/prompts/user-context';

const MAX_PAGES = 12;

/** One summary being ingested; a day's ingest covers all of that day's summaries. */
export interface IngestSource {
  path: string;
  label: string;
  markdown: string;
}

function sourceBlocks(sources: IngestSource[], period: string): string {
  return sources
    .map((s) => `<new_source path="${s.path}" label="${s.label}" period="${period}">\n${s.markdown}\n</new_source>`)
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Step 1 — plan: decide which entity/topic pages this source should touch.
// ---------------------------------------------------------------------------

export const ingestPlanSchema = z.object({
  sources: clampedArray(
    z.object({
      path: z.string().min(1),
      title: clampedString(200, 1),
      summary: clampedString(400, 1),
      tags: clampedArray(clampedString(40), 8).default([]),
    }),
    30,
  ),
  pages: clampedArray(
    z.object({
      path: clampedString(160, 1),
      title: clampedString(160, 1),
      reason: clampedString(300).optional(),
    }),
    MAX_PAGES * 2,
  ),
});
export type IngestPlan = z.infer<typeof ingestPlanSchema>;

export const ingestPlanPrompt = {
  toolName: 'plan_wiki_ingest',
  toolDescription:
    "Decide how a day's new sources should be filed into the wiki and which pages they should create or update.",
  toolInputSchema: {
    type: 'object',
    required: ['sources', 'pages'],
    properties: {
      sources: {
        type: 'array',
        description: 'One entry per new source, using its exact path.',
        items: {
          type: 'object',
          required: ['path', 'title', 'summary'],
          properties: {
            path: { type: 'string' },
            title: { type: 'string', maxLength: 200, description: 'Short human title for the source page.' },
            summary: {
              type: 'string',
              maxLength: 400,
              description: 'One sentence describing what this source covers, for the index.',
            },
            tags: { type: 'array', items: { type: 'string', maxLength: 40 }, maxItems: 8 },
          },
        },
      },
      pages: {
        type: 'array',
        maxItems: MAX_PAGES,
        description: 'Entity/topic pages to create or update, most important first.',
        items: {
          type: 'object',
          required: ['path', 'title'],
          properties: {
            path: {
              type: 'string',
              description:
                'Page path like people/jane-doe, teams/payments, projects/checkout-v2, topics/on-call. Reuse an existing path from the index whenever the entity already has a page.',
            },
            title: { type: 'string' },
            reason: { type: 'string', maxLength: 300 },
          },
        },
      },
    },
  } as const,

  system: (args: { schema: string; userCtx: UserContext }): string =>
    `You maintain ${args.userCtx.name}'s personal work wiki, following the schema below.
${args.userCtx.name}'s teams: ${formatTeams(args.userCtx)}.

You are planning the ingest of ONE DAY of new sources (one per connector, e.g. all Slack channels, a Jira project).
Choose up to ${MAX_PAGES} entity/topic pages (people/, teams/, projects/, topics/) that these sources together should
create or update. A topic that appears in several sources is ONE page.
- Prefer updating existing pages (exact path from the index) over creating near-duplicates.
- Create a new page only for a person/team/project/topic that is substantively discussed and likely to recur.
- Skip trivial mentions. If nothing durable appears, return an empty pages list.
- Paths are lowercase kebab-case slugs, e.g. people/jane-doe.

<schema>
${args.schema}
</schema>`,

  user: (args: { index: string; period: string; sources: IngestSource[] }): string =>
    `<index>
${args.index}
</index>

${sourceBlocks(args.sources, args.period)}`,
};

// ---------------------------------------------------------------------------
// Step 2 — write: produce the source page and the full new content of each page.
// ---------------------------------------------------------------------------

export const ingestWriteSchema = z.object({
  sources: z.array(z.object({ path: z.string().min(1), body: z.string().min(1) })),
  pages: z.array(
    z.object({
      path: z.string().min(1),
      title: clampedString(160, 1),
      summary: clampedString(400, 1),
      tags: clampedArray(clampedString(40), 8).optional(),
      body: z.string().min(1),
    }),
  ),
  contradictions: clampedArray(clampedString(500), 10).optional(),
});
export type IngestWrite = z.infer<typeof ingestWriteSchema>;

export const ingestWritePrompt = {
  toolName: 'write_wiki_pages',
  toolDescription: 'Write each source page and the full updated markdown body for each planned wiki page.',
  toolInputSchema: {
    type: 'object',
    required: ['sources', 'pages'],
    properties: {
      sources: {
        type: 'array',
        description: 'One source page per new source, using its exact path.',
        items: {
          type: 'object',
          required: ['path', 'body'],
          properties: {
            path: { type: 'string' },
            body: {
              type: 'string',
              description:
                'Markdown body for the source page: "# <title>", a short synthesis, then key points as bullets. Link every person/team/project/topic page it relates to.',
            },
          },
        },
      },
      pages: {
        type: 'array',
        items: {
          type: 'object',
          required: ['path', 'title', 'summary', 'body'],
          properties: {
            path: { type: 'string', description: 'Exactly one of the planned paths.' },
            title: { type: 'string' },
            summary: { type: 'string', maxLength: 400, description: 'One line for the index.' },
            tags: { type: 'array', items: { type: 'string' }, maxItems: 8 },
            body: {
              type: 'string',
              description:
                'The COMPLETE new markdown body of the page (no frontmatter). For existing pages, integrate the new information into the current body rather than appending.',
            },
          },
        },
      },
      contradictions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Claims in the new source that contradict what the wiki previously said, if any.',
      },
    },
  } as const,

  system: (args: { schema: string; userCtx: UserContext; today: string }): string =>
    `You maintain ${args.userCtx.name}'s personal work wiki. Follow the schema exactly. Today is ${args.today}.
${args.userCtx.name}'s teams: ${formatTeams(args.userCtx)}.

You are ingesting ONE DAY of new sources. Write:
1. One source page body per new source (a digest of that source, linking out to the entity/topic pages).
2. The complete new body for every planned page, combining what all of today's sources say about it. For pages marked "existing", start from the current body,
   integrate the new facts, rewrite "Current status", add a Timeline entry citing the source page, and keep everything
   else that is still true. Write ONE Timeline entry per page for the day, citing every source page that contributed.
   If a source is already cited on the page (a re-ingest), update that entry in place instead of adding a duplicate.

Return every planned page. Do not include frontmatter. Use [[path|Label]] links.

<schema>
${args.schema}
</schema>`,

  user: (args: {
    index: string;
    period: string;
    sources: IngestSource[];
    pages: Array<{ path: string; title: string; existingBody: string | null }>;
  }): string => {
    const pageBlocks = args.pages
      .map((p) =>
        p.existingBody
          ? `<page path="${p.path}" title="${p.title}" state="existing">\n${p.existingBody}\n</page>`
          : `<page path="${p.path}" title="${p.title}" state="new" />`,
      )
      .join('\n\n');
    return `<index>
${args.index}
</index>

${sourceBlocks(args.sources, args.period)}

<planned_pages>
${pageBlocks || '(none — only write the source pages)'}
</planned_pages>`;
  },
};
