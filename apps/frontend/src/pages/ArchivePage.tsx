import {
  Box,
  MenuItem,
  Pagination,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useActionItems, useUpdateActionItem } from '../api/hooks/action-items';
import { useRisks, useUpdateRisk } from '../api/hooks/risks';
import type { ActionItemStatus, RiskSeverity, RiskStatus } from '@kuros/shared';
import { StatusChip } from '../components/StatusChip';
import { EmptyState } from '../components/EmptyState';

const PAGE_SIZE = 20;

const ACTION_STATUSES: ActionItemStatus[] = ['open', 'in_progress', 'done', 'dismissed'];
const RISK_STATUSES: RiskStatus[] = ['open', 'mitigated', 'accepted', 'closed'];
const RISK_SEVERITIES: RiskSeverity[] = ['low', 'medium', 'high', 'critical'];

const ARCHIVED_ACTION_STATUSES = 'done,dismissed';
const ARCHIVED_RISK_STATUSES = 'closed';

function ArchivedActionItemsTab(): JSX.Element {
  const [page, setPage] = useState(1);
  const q = useActionItems({ status: ARCHIVED_ACTION_STATUSES, page, limit: PAGE_SIZE });
  const upd = useUpdateActionItem();

  if (q.isLoading) return <Typography>Loading…</Typography>;
  if (!q.data || q.data.data.length === 0)
    return <EmptyState title="No archived action items" description="Action items marked done or dismissed appear here." />;

  const pageCount = Math.ceil(q.data.total / PAGE_SIZE);

  return (
    <Stack spacing={2}>
      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Title</TableCell>
              <TableCell>Detail</TableCell>
              <TableCell>Due</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Updated</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {q.data.data.map((a) => (
              <TableRow key={a.id} hover>
                <TableCell>{a.title}</TableCell>
                <TableCell sx={{ maxWidth: 400, color: 'text.secondary' }}>
                  {a.detail?.slice(0, 200)}
                </TableCell>
                <TableCell>{a.dueDate ?? '—'}</TableCell>
                <TableCell>
                  <Select
                    size="small"
                    value={a.status}
                    onChange={(e) =>
                      upd.mutate({ id: a.id, body: { status: e.target.value as ActionItemStatus } })
                    }
                  >
                    {ACTION_STATUSES.map((s) => (
                      <MenuItem key={s} value={s}>{s}</MenuItem>
                    ))}
                  </Select>
                </TableCell>
                <TableCell>{new Date(a.updatedAt).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
      {pageCount > 1 && (
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="caption" color="text.secondary">
            {q.data.total} total
          </Typography>
          <Pagination
            count={pageCount}
            page={page}
            onChange={(_, v) => setPage(v)}
            size="small"
          />
        </Stack>
      )}
    </Stack>
  );
}

function ArchivedRisksTab(): JSX.Element {
  const [page, setPage] = useState(1);
  const q = useRisks({ status: ARCHIVED_RISK_STATUSES, page, limit: PAGE_SIZE });
  const upd = useUpdateRisk();

  if (q.isLoading) return <Typography>Loading…</Typography>;
  if (!q.data || q.data.data.length === 0)
    return <EmptyState title="No archived risks" description="Risks marked closed appear here." />;

  const pageCount = Math.ceil(q.data.total / PAGE_SIZE);

  return (
    <Stack spacing={2}>
      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Title</TableCell>
              <TableCell>Severity</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Updated</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {q.data.data.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell>
                  <Stack>
                    <Typography variant="body2">{r.title}</Typography>
                    {r.detail && (
                      <Typography variant="caption" color="text.secondary">
                        {r.detail.slice(0, 200)}
                      </Typography>
                    )}
                  </Stack>
                </TableCell>
                <TableCell>
                  <Select
                    size="small"
                    value={r.severity}
                    onChange={(e) =>
                      upd.mutate({ id: r.id, body: { severity: e.target.value as RiskSeverity } })
                    }
                  >
                    {RISK_SEVERITIES.map((s) => (
                      <MenuItem key={s} value={s}>
                        <StatusChip value={s} />
                      </MenuItem>
                    ))}
                  </Select>
                </TableCell>
                <TableCell>
                  <Select
                    size="small"
                    value={r.status}
                    onChange={(e) =>
                      upd.mutate({ id: r.id, body: { status: e.target.value as RiskStatus } })
                    }
                  >
                    {RISK_STATUSES.map((s) => (
                      <MenuItem key={s} value={s}>{s}</MenuItem>
                    ))}
                  </Select>
                </TableCell>
                <TableCell>{new Date(r.updatedAt).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
      {pageCount > 1 && (
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="caption" color="text.secondary">
            {q.data.total} total
          </Typography>
          <Pagination
            count={pageCount}
            page={page}
            onChange={(_, v) => setPage(v)}
            size="small"
          />
        </Stack>
      )}
    </Stack>
  );
}

export function ArchivePage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'risks' ? 'risks' : 'actions';
  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Archive</Typography>
      <Tabs
        value={tab}
        onChange={(_, v) => {
          const next = new URLSearchParams(params);
          next.set('tab', v as string);
          setParams(next, { replace: true });
        }}
        sx={{ mb: 2 }}
      >
        <Tab value="actions" label="Action items" />
        <Tab value="risks" label="Risks" />
      </Tabs>
      {tab === 'actions' ? <ArchivedActionItemsTab /> : <ArchivedRisksTab />}
    </Box>
  );
}
