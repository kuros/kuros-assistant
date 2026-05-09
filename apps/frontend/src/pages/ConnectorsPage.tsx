import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Drawer,
  Stack,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import {
  useConnectors,
  useCreateConnector,
  useDeleteConnector,
  useSyncConnector,
  useTestConnector,
} from '../api/hooks/connectors';
import { StatusChip } from '../components/StatusChip';
import { EmptyState } from '../components/EmptyState';
import { ConnectorForm } from './connectors/ConnectorForm';

export function ConnectorsPage(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message?: string; deviceCode?: { userCode: string; verificationUri: string; expiresAt: string } } | null>(null);
  const list = useConnectors();
  const create = useCreateConnector();
  const del = useDeleteConnector();
  const test = useTestConnector();
  const sync = useSyncConnector();

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5">Connectors</Typography>
        <Button startIcon={<AddIcon />} variant="contained" onClick={() => setOpen(true)}>
          New connector
        </Button>
      </Stack>

      {testResult && (
        <Alert
          severity={testResult.ok ? 'success' : 'warning'}
          sx={{ mb: 2 }}
          onClose={() => setTestResult(null)}
        >
          {testResult.message}
          {testResult.deviceCode && (
            <Box sx={{ mt: 1 }}>
              Visit{' '}
              <a href={testResult.deviceCode.verificationUri} target="_blank" rel="noreferrer">
                {testResult.deviceCode.verificationUri}
              </a>{' '}
              and enter code <strong>{testResult.deviceCode.userCode}</strong>.
            </Box>
          )}
        </Alert>
      )}

      {list.isLoading && <Typography>Loading…</Typography>}
      {list.data && list.data.length === 0 && (
        <EmptyState title="No connectors yet" description="Add a Slack or Outlook connector to get started." />
      )}

      <Stack spacing={2}>
        {list.data?.map((c) => (
          <Card key={c.id} variant="outlined">
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="h6">{c.name}</Typography>
                <StatusChip value={c.kind} />
                <StatusChip value={c.status} />
              </Stack>
              {c.lastError && (
                <Typography variant="body2" color="error" sx={{ mt: 1 }}>
                  {c.lastError}
                </Typography>
              )}
            </CardContent>
            <CardActions>
              <Button
                size="small"
                onClick={async () => {
                  const r = await test.mutateAsync(c.id);
                  setTestResult({ id: c.id, ...r });
                }}
              >
                Test
              </Button>
              <Button size="small" onClick={() => sync.mutate({ id: c.id, body: {} })}>
                Sync now
              </Button>
              <Button size="small" color="error" onClick={() => del.mutate(c.id)}>
                Delete
              </Button>
            </CardActions>
          </Card>
        ))}
      </Stack>

      <Drawer anchor="right" open={open} onClose={() => setOpen(false)}>
        <Box sx={{ width: 480, p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            New connector
          </Typography>
          <ConnectorForm
            onSubmit={async (values) => {
              await create.mutateAsync(values);
              setOpen(false);
            }}
            onCancel={() => setOpen(false)}
            submitting={create.isPending}
          />
        </Box>
      </Drawer>
    </Box>
  );
}
