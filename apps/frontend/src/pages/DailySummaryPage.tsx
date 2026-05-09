import { useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { format } from 'date-fns';
import { useDailySummaries } from '../api/hooks/summaries';
import { MarkdownView } from '../components/MarkdownView';
import { EmptyState } from '../components/EmptyState';

export function DailySummaryPage(): JSX.Element {
  const [date, setDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const q = useDailySummaries({ date });

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
        <Typography variant="h5">Daily summary</Typography>
        <TextField
          type="date"
          size="small"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Stack>

      {q.isLoading && <Typography>Loading…</Typography>}
      {q.data && q.data.summaries.length === 0 && (
        <EmptyState title="No summaries for this date" description="Run a sync, or pick another day." />
      )}

      <Stack spacing={1}>
        {q.data?.summaries.map((s) => (
          <Accordion key={s.id} defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>{s.targetId} — {s.kind}</Typography>
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
