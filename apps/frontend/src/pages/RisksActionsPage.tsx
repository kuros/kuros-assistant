import {
  Box,
  Button,
  MenuItem,
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
import SyncIcon from '@mui/icons-material/Sync';
import { useSearchParams } from 'react-router-dom';
import { useActionItems, useUpdateActionItem } from '../api/hooks/action-items';
import { useRisks, useUpdateRisk } from '../api/hooks/risks';
import { useSyncAllConnectors } from '../api/hooks/connectors';
import type { ActionItemStatus, RiskSeverity, RiskStatus } from '@kuros/shared';
import { StatusChip } from '../components/StatusChip';
import { EmptyState } from '../components/EmptyState';

const ACTION_STATUSES: ActionItemStatus[] = ['open', 'in_progress', 'done', 'dismissed'];
const RISK_STATUSES: RiskStatus[] = ['open', 'mitigated', 'accepted', 'closed'];
const RISK_SEVERITIES: RiskSeverity[] = ['low', 'medium', 'high', 'critical'];

const ACTIVE_ACTION_STATUSES: ActionItemStatus[] = ['open', 'in_progress'];
const ACTIVE_RISK_STATUSES: RiskStatus[] = ['open', 'mitigated', 'accepted'];

function ActionItemsTab(): JSX.Element {
  const q = useActionItems({ status: ACTIVE_ACTION_STATUSES.join(',') });
  const upd = useUpdateActionItem();
  if (q.isLoading) return <Typography>Loading…</Typography>;
  if (!q.data || q.data.data.length === 0)
    return <EmptyState title="No action items" description="They appear after a daily summary runs." />;
  return (
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
  );
}

function RisksTab(): JSX.Element {
  const q = useRisks({ status: ACTIVE_RISK_STATUSES.join(',') });
  const upd = useUpdateRisk();
  if (q.isLoading) return <Typography>Loading…</Typography>;
  if (!q.data || q.data.data.length === 0)
    return <EmptyState title="No risks tracked" description="They appear after a daily summary runs." />;
  return (
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
  );
}

export function RisksActionsPage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'risks' ? 'risks' : 'actions';
  const syncAll = useSyncAllConnectors();
  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5">Risks & action items</Typography>
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
      {tab === 'actions' ? <ActionItemsTab /> : <RisksTab />}
    </Box>
  );
}
