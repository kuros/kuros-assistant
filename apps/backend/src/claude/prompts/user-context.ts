export interface UserContext {
  name: string;
  email: string | null;
  teams: Array<{ name: string; description: string | null; memberNames: string[] }>;
}

export function formatTeams(ctx: UserContext): string {
  if (ctx.teams.length === 0) return 'no configured teams';
  return ctx.teams
    .map((t) => {
      const members = t.memberNames.length > 0 ? `members: ${t.memberNames.join(', ')}` : '';
      const desc = t.description ? `purpose: ${t.description}` : '';
      const details = [desc, members].filter(Boolean).join('; ');
      return details ? `${t.name} (${details})` : t.name;
    })
    .join(' | ');
}
