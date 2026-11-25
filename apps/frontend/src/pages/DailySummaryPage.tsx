import { Link, useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { addDays, format, parseISO } from 'date-fns';
import type { ConnectorDto, SummaryDto } from '@kuros/shared';
import { COMBINED_TARGET_ID } from '../api/constants';
import { useDailySummaries, useGenerateDailySummaries } from '../api/hooks/summaries';
import { useConnectors, useSyncAllConnectors } from '../api/hooks/connectors';
import { EmptyState } from '../components/EmptyState';
import { SummaryBackfillDialog } from '../components/SummaryBackfill';
import HistoryIcon from '@mui/icons-material/History';
import { useState } from 'react';

const KIND_LABEL: Record<string, string> = { slack: 'Slack', outlook: 'Outlook', jira: 'Jira' };

function previewMarkdown(md: string, maxChars = 300): string {
  const stripped = md.replace(/#{1,6}\s*/g, '').replace(/[*`>_~]/g, '').trim();
  return stripped.length > maxChars ? stripped.slice(0, maxChars) + '…' : stripped;
}

export function DailySummaryPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const date = searchParams.get('date') ?? format(new Date(), 'yyyy-MM-dd');
  const setDate = (next: string) => setSearchParams({ date: next });
  const q = useDailySummaries({ date });
  const connectorsQ = useConnectors();
  const syncAll = useSyncAllConnectors();
  const generate = useGenerateDailySummaries();
  const [backfillOpen, setBackfillOpen] = useState(false);

  const connectorMap = new Map<string, ConnectorDto>(
    (connectorsQ.data ?? []).map((c) => [c.id, c]),
  );

  const grouped = new Map<string, SummaryDto[]>();
  for (const s of q.data?.summaries ?? []) {
    const arr = grouped.get(s.connectorId) ?? [];
    arr.push(s);
    grouped.set(s.connectorId, arr);
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography variant="h5">Daily summary</Typography>
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
        <Stack direction="row" spacing={1}>
          <Button startIcon={<HistoryIcon />} variant="outlined" size="small" onClick={() => setBackfillOpen(true)}>
            Summarize missing days
          </Button>
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
            onClick={() => generate.mutate({ date })}
          >
            {generate.isPending ? 'Generating…' : 'Generate summaries'}
          </Button>
        </Stack>
      </Stack>

      <SummaryBackfillDialog open={backfillOpen} onClose={() => setBackfillOpen(false)} />

      {q.isLoading && <Typography>Loading…</Typography>}
      {q.data && grouped.size === 0 && (
        <EmptyState
          title="No summaries for this date"
          description="Click 'Generate summaries' to create AI summaries from synced data, or pick another day."
        />
      )}

      <Stack spacing={2}>
        {Array.from(grouped.entries()).map(([connectorId, summaries]) => {
          const connector = connectorMap.get(connectorId);
          const totalItems = summaries.reduce((sum, s) => sum + s.itemCount, 0);
          return (
            <Card key={connectorId} variant="outlined">
              <CardHeader
                title={
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="h6">
                      {connector?.name ?? 'Unknown connector'}
                    </Typography>
                    {connector && (
                      <Chip
                        label={KIND_LABEL[connector.kind] ?? connector.kind}
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </Stack>
                }
                subheader={`${summaries.length} source${summaries.length !== 1 ? 's' : ''} · ${totalItems} items`}
              />
              <CardContent sx={{ pt: 0 }}>
                <Stack spacing={1.5} divider={<Divider />}>
                  {summaries.map((s) => (
                    <Box key={s.id}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                        {s.targetId === COMBINED_TARGET_ID ? 'All channels' : s.targetId}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                        {previewMarkdown(q.data!.markdownByPath[s.filePath] ?? '')}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
              <CardActions sx={{ px: 2, pb: 1.5 }}>
                <Button
                  component={Link}
                  to={`/daily/connectors/${connectorId}?date=${date}`}
                  endIcon={<ArrowForwardIcon />}
                  size="small"
                >
                  View full summaries
                </Button>
              </CardActions>
            </Card>
          );
        })}
      </Stack>
    </Box>
  );
}
