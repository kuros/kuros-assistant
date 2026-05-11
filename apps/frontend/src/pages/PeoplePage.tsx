import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Drawer,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { PersonDto } from '@kuros/shared';
import { usePeople, useCreatePerson, useUpdatePerson, useDeletePerson } from '../api/hooks/people';
import { EmptyState } from '../components/EmptyState';

interface FormValues {
  name: string;
  role: string;
  email: string;
  slackUserId: string;
  outlookAddress: string;
}

function PersonForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: FormValues;
  onSubmit: (v: FormValues) => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [v, setV] = useState<FormValues>(
    initial ?? { name: '', role: '', email: '', slackUserId: '', outlookAddress: '' },
  );
  const set = (key: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <Stack
      spacing={2}
      component="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <TextField label="Name" required size="small" value={v.name} onChange={set('name')} />
      <TextField label="Role" size="small" value={v.role} onChange={set('role')} />
      <TextField label="Email" type="email" size="small" value={v.email} onChange={set('email')} />
      <TextField label="Slack user ID" size="small" value={v.slackUserId} onChange={set('slackUserId')} />
      <TextField label="Outlook address" size="small" value={v.outlookAddress} onChange={set('outlookAddress')} />
      <Stack direction="row" spacing={1} justifyContent="flex-end">
        <Button variant="outlined" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={submitting || !v.name.trim()}>
          {submitting ? 'Saving…' : 'Save'}
        </Button>
      </Stack>
    </Stack>
  );
}

type DrawerState = 'new' | PersonDto | null;

function nullify(s: string): string | null {
  return s.trim() || null;
}

export function PeoplePage(): JSX.Element {
  const list = usePeople();
  const create = useCreatePerson();
  const update = useUpdatePerson();
  const del = useDeletePerson();
  const [drawer, setDrawer] = useState<DrawerState>(null);

  const isNew = drawer === 'new';
  const isPending = isNew ? create.isPending : update.isPending;

  function toFormValues(p: PersonDto): FormValues {
    return {
      name: p.name,
      role: p.role ?? '',
      email: p.email ?? '',
      slackUserId: p.slackUserId ?? '',
      outlookAddress: p.outlookAddress ?? '',
    };
  }

  async function handleSubmit(v: FormValues) {
    const body = {
      name: v.name.trim(),
      role: nullify(v.role),
      email: nullify(v.email),
      slackUserId: nullify(v.slackUserId),
      outlookAddress: nullify(v.outlookAddress),
    };
    if (isNew) {
      await create.mutateAsync(body);
    } else if (drawer) {
      await update.mutateAsync({ id: (drawer as PersonDto).id, body });
    }
    setDrawer(null);
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5">People</Typography>
        <Button startIcon={<AddIcon />} variant="contained" onClick={() => setDrawer('new')}>
          Add person
        </Button>
      </Stack>

      {list.isLoading && <Typography>Loading…</Typography>}
      {list.data?.length === 0 && (
        <EmptyState
          title="No people yet"
          description="Add people to enable person-level insights and tracking."
        />
      )}

      <Stack spacing={2}>
        {list.data?.map((p) => (
          <Card key={p.id} variant="outlined">
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <Typography variant="h6">{p.name}</Typography>
                {p.role && <Chip label={p.role} size="small" />}
              </Stack>
              <Stack spacing={0.25}>
                {p.email && (
                  <Typography variant="body2" color="text.secondary">
                    Email: {p.email}
                  </Typography>
                )}
                {p.slackUserId && (
                  <Typography variant="body2" color="text.secondary">
                    Slack: {p.slackUserId}
                  </Typography>
                )}
                {p.outlookAddress && (
                  <Typography variant="body2" color="text.secondary">
                    Outlook: {p.outlookAddress}
                  </Typography>
                )}
              </Stack>
            </CardContent>
            <CardActions>
              <Button size="small" onClick={() => setDrawer(p)}>Edit</Button>
              <Button size="small" color="error" disabled={del.isPending} onClick={() => del.mutate(p.id)}>
                Delete
              </Button>
            </CardActions>
          </Card>
        ))}
      </Stack>

      <Drawer anchor="right" open={drawer !== null} onClose={() => setDrawer(null)}>
        <Box sx={{ width: 420, p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {isNew ? 'Add person' : 'Edit person'}
          </Typography>
          {drawer !== null && (
            <PersonForm
              initial={!isNew ? toFormValues(drawer as PersonDto) : undefined}
              onSubmit={handleSubmit}
              onCancel={() => setDrawer(null)}
              submitting={isPending}
            />
          )}
        </Box>
      </Drawer>
    </Box>
  );
}
