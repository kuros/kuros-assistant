import { useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SyncIcon from '@mui/icons-material/Sync';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { format, getISOWeek, getISOWeekYear } from 'date-fns';
import { useGenerateWeeklySummaries, useWeeklySummaries } from '../api/hooks/summaries';
import { useSyncAllConnectors } from '../api/hooks/connectors';
import { MarkdownView } from '../components/MarkdownView';
import { EmptyState } from '../components/EmptyState';

function currentISOWeek(): string {
  const now = new Date();
  return `${getISOWeekYear(now)}-W${String(getISOWeek(now)).padStart(2, '0')}`;
}

export function WeeklySummaryPage(): JSX.Element {
  const [isoWeek, setIsoWeek] = useState<string>(currentISOWeek());
  const q = useWeeklySummaries({ isoWeek });
  const syncAll = useSyncAllConnectors();
  const generate = useGenerateWeeklySummaries();

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography variant="h5">Weekly summary</Typography>
          <TextField
            type="week"
            size="small"
            value={isoWeek}
            onChange={(e) => setIsoWeek(e.target.value)}
            helperText={`Current: ${format(new Date(), 'yyyy-MM-dd')}`}
          />
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button
            startIcon={<SyncIcon />}
            variant="outlined"
            size="small"
            disabled={syncAll.isPending}
            onClick={() => syncAll.mutate()}
          >
            {syncAll.isPending ? 'Syncing…' : 'Sync now'}
          </Button>
          <Button
            startIcon={<AutoAwesomeIcon />}
            variant="contained"
            size="small"
            disabled={generate.isPending}
            onClick={() => generate.mutate({ isoWeek })}
          >
            {generate.isPending ? 'Generating…' : 'Generate summary'}
          </Button>
        </Stack>
      </Stack>

      {q.isLoading && <Typography>Loading…</Typography>}
      {q.data && q.data.summaries.length === 0 && (
        <EmptyState title="No weekly summary yet" description="Weekly summaries roll up Monday morning." />
      )}

      <Stack spacing={1}>
        {q.data?.summaries.map((s) => (
          <Accordion key={s.id} defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>{s.targetId}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <MarkdownView markdown={q.data!.markdownByPath[s.filePath] ?? ''} />
            </AccordionDetails>
          </Accordion>
        ))}
      </Stack>
    </Box>
  );
}
