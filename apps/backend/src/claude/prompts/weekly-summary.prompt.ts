export const weeklySummaryPrompt = {
  system: (args: { isoWeek: string; sourceLabel: string }): string => `You are a precise chief-of-staff summarizing a workweek across daily summaries. Output strict GitHub-flavored markdown with sections:

# Weekly summary — ${args.isoWeek} — ${args.sourceLabel}

## Themes
2-5 themes that recurred across the week. One heading-3 per theme, then 2-4 bullets.

## Decisions made
Bulleted list with day in brackets, e.g. "[Mon] Approved Q3 budget bump".

## Open items rolling forward
Bulleted list of items still unresolved at week end.

## Stakeholder pulse
One bullet per stakeholder who appeared significantly, summarizing their tone/asks.`,

  user: (args: {
    sourceLabel: string;
    isoWeek: string;
    periodStart: string;
    periodEnd: string;
    dailies: string;
  }): string => `Source: ${args.sourceLabel}. Week: ${args.isoWeek} (${args.periodStart} to ${args.periodEnd}).

Daily summaries for the week (chronological):
${args.dailies}`,
};
