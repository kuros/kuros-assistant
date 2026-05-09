import { useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { format, subDays } from 'date-fns';
import { useTeams } from '../api/hooks/teams';
import { useGenerateInsight, useInsight } from '../api/hooks/insights';
import { MarkdownView } from '../components/MarkdownView';
import { EmptyState } from '../components/EmptyState';

export function TeamInsightsPage(): JSX.Element {
  const teams = useTeams();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [from, setFrom] = useState<string>(format(subDays(new Date(), 14), 'yyyy-MM-dd'));
  const [to, setTo] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const generate = useGenerateInsight();
  const insight = useInsight(teamId ? { scope: 'team', scopeId: teamId, from, to } : null);

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Team insights
      </Typography>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
        <Autocomplete
          options={teams.data ?? []}
          getOptionLabel={(t) => t.name}
          sx={{ minWidth: 240 }}
          onChange={(_, v) => setTeamId(v?.id ?? null)}
          renderInput={(params) => <TextField {...params} label="Team" size="small" />}
        />
        <TextField
          type="date"
          size="small"
          label="From"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          type="date"
          size="small"
          label="To"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <Button
          variant="contained"
          disabled={!teamId || generate.isPending}
          onClick={() =>
            teamId && generate.mutate({ scope: 'team', scopeId: teamId, body: { from, to } })
          }
        >
          {generate.isPending ? 'Generating…' : 'Generate'}
        </Button>
      </Stack>

      {!teamId ? (
        <EmptyState title="Pick a team" description="Insights are generated on demand from the summary corpus." />
      ) : insight.isError ? (
        <EmptyState title="No insight generated yet" description="Click Generate to create one." />
      ) : insight.data ? (
        <MarkdownView markdown={insight.data.markdown} />
      ) : (
        <Typography>Loading…</Typography>
      )}
    </Box>
  );
}
