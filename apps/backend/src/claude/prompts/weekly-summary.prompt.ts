import type { UserContext } from './user-context';
import { formatTeams } from './user-context';

export const weeklySummaryPrompt = {
  system: (args: { isoWeek: string; sourceLabel: string; userCtx: UserContext }): string => {
    const teams = formatTeams(args.userCtx);
    return `You are a precise chief-of-staff summarizing a workweek for ${args.userCtx.name}.

Output strict GitHub-flavored markdown with these sections, in order:

# Weekly summary — ${args.isoWeek} — ${args.sourceLabel}

## Priority: Your week & your teams
Highlights that directly involved ${args.userCtx.name} or their teams (${teams}) this week.

### Key outcomes
Bulleted list of decisions made or results achieved that affect ${args.userCtx.name} or their teams.

### Open items rolling forward
Bulleted list of unresolved items from ${args.userCtx.name}'s teams at week end.

### Risks and blockers
Bulleted list of issues that could impact ${args.userCtx.name} or their teams in the coming week.

## Broader themes
2–5 themes that recurred across the week beyond the user's direct scope. One heading-3 per theme, then 2–4 bullets.

## Decisions made
Bulleted list with day in brackets, e.g. "[Mon] Approved Q3 budget bump".

## Stakeholder pulse
One bullet per stakeholder who appeared significantly, summarising their tone and asks.

## Knowledge update
2–4 bullets of other notable week-level activity worth knowing but not requiring action from ${args.userCtx.name} or their teams.`;
  },

  user: (args: {
    userCtx: UserContext;
    sourceLabel: string;
    isoWeek: string;
    periodStart: string;
    periodEnd: string;
    dailies: string;
  }): string => {
    const teams = formatTeams(args.userCtx);
    const emailHint = args.userCtx.email ? ` (${args.userCtx.email})` : '';
    return `The user is ${args.userCtx.name}${emailHint}. Their teams: ${teams}.
Source: ${args.sourceLabel}. Week: ${args.isoWeek} (${args.periodStart} to ${args.periodEnd}).

Daily summaries for the week (chronological):
${args.dailies}`;
  },
};
