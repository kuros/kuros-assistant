/**
 * Default SCHEMA.md seeded into every user's wiki. It plays the role of the
 * gist's CLAUDE.md/AGENTS.md: the conventions the LLM follows when it
 * maintains the wiki. The live copy on disk is what prompts read, so a user
 * can evolve it per wiki.
 */
export const WIKI_SCHEMA_MD = `# Wiki schema

This is a personal work knowledge base maintained by an LLM. The human reads it; the LLM writes it.
Raw sources are the AI-generated daily summaries of the user's Slack channels, mailboxes and Jira
projects. Those summaries are immutable; this wiki is the compiled, cross-linked layer on top of them.

## Layout

| Folder | Holds | One page per |
| --- | --- | --- |
| \`sources/daily/<date>/\` | Digest of one ingested daily summary | summary |
| \`people/\` | A person the user works with | person (slug of full name, e.g. \`people/jane-doe\`) |
| \`teams/\` | A team, group or org unit | team |
| \`projects/\` | A project, epic, initiative, product, customer engagement or system/service | project |
| \`topics/\` | A recurring theme, decision area, process, incident class or concept | topic |
| \`daily/<date>\` | Highlights of a day (generated) | day |
| \`answers/\` | Answers to questions, filed back so exploration compounds | answer |

\`index.md\` (catalog) and \`log.md\` (chronological record) are maintained by the system.

## Linking

- Link with \`[[folder/slug|Display text]]\`, e.g. \`[[people/jane-doe|Jane]]\`, \`[[projects/checkout-v2|Checkout v2]]\`.
- Link generously: every person, team, project and topic mentioned should be linked the first time it appears on a page.
- Only link to pages that exist in the index or that are being created in the same ingest.
- Cite sources by linking the source page, e.g. "(see [[sources/daily/2026-11-24/slack-eng-a1b2c3|#eng 24 Nov]])".

## Entity / topic page structure

\`\`\`
# <Title>

<2-4 sentence synthesis: who/what this is, why it matters to the user, current state.>

## Key facts
- Stable facts (role, owner, scope, links to related teams/projects/people).

## Current status
- What is true *now*. Rewrite this section as things change; do not let it go stale.

## Open questions & risks
- Unresolved items, blockers, risks. Remove when resolved.

## Timeline
- **YYYY-MM-DD** — what happened ([[sources/...|source]]). Newest first. Keep ~20 entries; condense older ones into a single summary line.
\`\`\`

## Rules

1. **Synthesise, don't append.** When updating a page, integrate new information into the existing narrative.
   Rewrite "Current status" so it reflects the latest state.
2. **Flag contradictions.** If a new source contradicts an existing claim, keep the newer claim, and note
   the change explicitly (e.g. "Launch moved from 1 Dec to 8 Dec (was 1 Dec per [[sources/...]])").
3. **Be specific.** Names, dates, numbers, ticket keys, decisions. No filler.
4. **Only durable knowledge gets its own page.** Make a page for a person/project/topic that is likely to come up
   again. One-off chatter belongs only in the source page.
5. **Stay concise.** Pages should be readable in under two minutes. Prefer bullets.
6. **Never invent facts.** Everything must be traceable to a source page.
7. **The user is the reader.** Frame things in terms of what matters to them, their teams and their work.
`;
