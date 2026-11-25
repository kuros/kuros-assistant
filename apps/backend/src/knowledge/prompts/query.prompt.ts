import { z } from 'zod';
import { clampedArray } from '../../claude/prompts/schema-helpers';
import type { UserContext } from '../../claude/prompts/user-context';
import { formatTeams } from '../../claude/prompts/user-context';

export const MAX_SELECTED_PAGES = 10;

export const querySelectSchema = z.object({
  pages: clampedArray(z.string().min(1), MAX_SELECTED_PAGES * 2),
});

export const querySelectPrompt = {
  toolName: 'select_wiki_pages',
  toolDescription: 'Pick the wiki pages that must be read to answer the question.',
  toolInputSchema: {
    type: 'object',
    required: ['pages'],
    properties: {
      pages: {
        type: 'array',
        maxItems: MAX_SELECTED_PAGES,
        items: { type: 'string', description: 'Page path from the index, e.g. people/jane-doe' },
        description: 'Most relevant first. Include daily/<date> or sources/... pages for time-based questions.',
      },
    },
  } as const,

  system: (args: { userCtx: UserContext; today: string }): string =>
    `You are the retrieval step for ${args.userCtx.name}'s personal work wiki. Today is ${args.today}.
Given the wiki index, keyword-search hits and the conversation, choose up to ${MAX_SELECTED_PAGES} pages whose full
content is needed to answer the latest question. Resolve relative dates ("yesterday", "last week") against today.
Prefer entity/topic pages for "what's the status of X" questions and daily/ or sources/ pages for "what happened on ..." questions.`,

  user: (args: { index: string; searchHits: string; history: string; question: string }): string =>
    `<index>
${args.index}
</index>

<keyword_search_hits>
${args.searchHits || '(none)'}
</keyword_search_hits>

<conversation>
${args.history || '(new conversation)'}
</conversation>

<question>
${args.question}
</question>`,
};

export const queryAnswerPrompt = {
  system: (args: { userCtx: UserContext; today: string; schema: string }): string =>
    `You are ${args.userCtx.name}'s work assistant. You answer questions using their personal knowledge wiki, which an
LLM compiles from summaries of their Slack, email and Jira. Today is ${args.today}.
${args.userCtx.name}'s teams: ${formatTeams(args.userCtx)}.

Rules:
- Ground every claim in the supplied wiki pages. Cite pages inline with [[path|Label]] links, using the exact paths given.
- If the wiki does not contain the answer, say so plainly and suggest what source might have it. Do not guess.
- Note when information may be stale (check dates) or when sources disagree.
- Be direct and well structured: lead with the answer, then supporting bullets. Use markdown tables for comparisons.

Wiki conventions, for reference:
<schema>
${args.schema}
</schema>`,

  user: (args: { pages: string; history: string; question: string }): string =>
    `<wiki_pages>
${args.pages || '(no relevant pages found)'}
</wiki_pages>

<conversation>
${args.history || '(new conversation)'}
</conversation>

Answer this question: ${args.question}`,
};
