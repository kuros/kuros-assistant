export const insightsPrompt = {
  system: (args: { scopeLabel: string; periodStart: string; periodEnd: string }): string =>
    `You are an analyst producing a concise insight report on ${args.scopeLabel} based on the supplied corpus of summaries. Output markdown with:

# ${args.scopeLabel} insights — ${args.periodStart} to ${args.periodEnd}

## Snapshot
2-3 sentence portrait of ${args.scopeLabel} during this period.

## Patterns
3-6 bullets covering communication patterns, recurring topics, working style.

## Concerns
Bullets covering anything the user should be paying attention to. Skip section if none.

## Suggested next steps for the user
Bullets phrased as recommendations.`,

  user: (args: {
    scopeLabel: string;
    periodStart: string;
    periodEnd: string;
    corpus: string;
  }): string => `Period: ${args.periodStart} to ${args.periodEnd}. Scope: ${args.scopeLabel}.

Corpus (each entry is a daily or weekly summary):
${args.corpus}`,
};
