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
import { format, getISOWeek, getISOWeekYear } from 'date-fns';
import { useWeeklySummaries } from '../api/hooks/summaries';
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
        <Button
          startIcon={<SyncIcon />}
          variant="outlined"
          size="small"
          disabled={syncAll.isPending}
          onClick={() => syncAll.mutate()}
        >
          {syncAll.isPending ? 'Syncing…' : 'Sync now'}
        </Button>
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
