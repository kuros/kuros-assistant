import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { format } from 'date-fns';
import type { ConnectorDto, SummaryDto } from '@kuros/shared';
import { useDailySummaries, useGenerateDailySummaries } from '../api/hooks/summaries';
import { useConnectors, useSyncAllConnectors } from '../api/hooks/connectors';
import { EmptyState } from '../components/EmptyState';

const KIND_LABEL: Record<string, string> = { slack: 'Slack', outlook: 'Outlook', jira: 'Jira' };

function previewMarkdown(md: string, maxChars = 300): string {
  const stripped = md.replace(/#{1,6}\s*/g, '').replace(/[*`>_~]/g, '').trim();
  return stripped.length > maxChars ? stripped.slice(0, maxChars) + '…' : stripped;
}

export function DailySummaryPage(): JSX.Element {
  const [date, setDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const q = useDailySummaries({ date });
  const connectorsQ = useConnectors();
  const syncAll = useSyncAllConnectors();
  const generate = useGenerateDailySummaries();

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
          <TextField
            type="date"
            size="small"
            value={date}
            onChange={(e) => setDate(e.target.value)}
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
            onClick={() => generate.mutate({ date })}
          >
            {generate.isPending ? 'Generating…' : 'Generate summaries'}
          </Button>
        </Stack>
      </Stack>

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
                        {s.targetId}
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
