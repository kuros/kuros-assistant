import { useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { addDays, format, parseISO } from 'date-fns';
import { useDailySummaries, useGenerateDailySummaries, useRegenerateDailySummary } from '../api/hooks/summaries';
import { useConnector } from '../api/hooks/connectors';
import { MarkdownView } from '../components/MarkdownView';
import { EmptyState } from '../components/EmptyState';

const KIND_LABEL: Record<string, string> = { slack: 'Slack', outlook: 'Outlook', jira: 'Jira' };

export function ConnectorDailySummaryPage(): JSX.Element {
  const { connectorId } = useParams<{ connectorId: string }>();
  const [searchParams] = useSearchParams();
  const [date, setDate] = useState<string>(
    searchParams.get('date') ?? format(new Date(), 'yyyy-MM-dd'),
  );

  const connectorQ = useConnector(connectorId ?? null);
  const q = useDailySummaries({ date, connectorId });
  const generate = useGenerateDailySummaries();
  const regenerate = useRegenerateDailySummary();

  const connector = connectorQ.data;

  return (
    <Box>
      <Button component={Link} to="/daily" startIcon={<ArrowBackIcon />} size="small" sx={{ mb: 2 }}>
        Daily summary
      </Button>

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography variant="h5">{connector?.name ?? 'Connector'}</Typography>
          {connector && (
            <Chip
              label={KIND_LABEL[connector.kind] ?? connector.kind}
              size="small"
              variant="outlined"
            />
          )}
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <IconButton
              size="small"
              aria-label="Previous day"
              onClick={() => setDate(format(addDays(parseISO(date), -1), 'yyyy-MM-dd'))}
            >
              <ChevronLeftIcon />
            </IconButton>
            <TextField
              type="date"
              size="small"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <IconButton
              size="small"
              aria-label="Next day"
              onClick={() => setDate(format(addDays(parseISO(date), 1), 'yyyy-MM-dd'))}
            >
              <ChevronRightIcon />
            </IconButton>
          </Stack>
        </Stack>
        <Button
          startIcon={<AutoAwesomeIcon />}
          variant="contained"
          size="small"
          disabled={generate.isPending}
          onClick={() => generate.mutate({ date })}
        >
          {generate.isPending ? 'Generating…' : 'Generate summaries'}
        </Button>
      </Stack>

      {q.isLoading && <Typography>Loading…</Typography>}
      {q.data && q.data.summaries.length === 0 && (
        <EmptyState
          title="No summaries for this date"
          description="Click 'Generate summaries' to create AI summaries, or pick another day."
        />
      )}

      <Stack spacing={1}>
        {q.data?.summaries.map((s) => (
          <Accordion key={s.id} defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" alignItems="center" spacing={2} sx={{ flex: 1, mr: 1 }}>
                <Typography>{s.targetId}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {s.itemCount} items · {s.modelUsed}
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Button
                  size="small"
                  startIcon={<RefreshIcon />}
                  disabled={regenerate.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    regenerate.mutate({ date, connectorId: connectorId!, targetId: s.targetId });
                  }}
                >
                  Regenerate
                </Button>
              </Stack>
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
