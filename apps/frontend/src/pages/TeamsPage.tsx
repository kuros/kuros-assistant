import { useState } from 'react';
import {
  Autocomplete,
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
import type { PersonDto, TeamDto } from '@kuros/shared';
import { useTeams, useCreateTeam, useUpdateTeam, useDeleteTeam } from '../api/hooks/teams';
import { usePeople } from '../api/hooks/people';
import { EmptyState } from '../components/EmptyState';

interface FormValues {
  name: string;
  description: string;
  members: PersonDto[];
}

function TeamForm({
  initial,
  people,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: FormValues;
  people: PersonDto[];
  onSubmit: (v: FormValues) => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [v, setV] = useState<FormValues>(initial ?? { name: '', description: '', members: [] });

  return (
    <Stack
      spacing={2}
      component="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <TextField
        label="Team name"
        required
        size="small"
        value={v.name}
        onChange={(e) => setV((prev) => ({ ...prev, name: e.target.value }))}
      />
      <TextField
        label="Description"
        size="small"
        multiline
        minRows={2}
        placeholder="Briefly describe this team's purpose or focus area. This helps the AI generate more relevant summaries."
        value={v.description}
        onChange={(e) => setV((prev) => ({ ...prev, description: e.target.value }))}
      />
      <Autocomplete
        multiple
        options={people}
        getOptionLabel={(p) => p.name}
        value={v.members}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        onChange={(_, val) => setV((prev) => ({ ...prev, members: val }))}
        renderInput={(params) => <TextField {...params} label="Members" size="small" />}
        renderTags={(value, getTagProps) =>
          value.map((option, index) => {
            const { key, ...tagProps } = getTagProps({ index });
            return <Chip key={key} label={option.name} size="small" {...tagProps} />;
          })
        }
      />
      <Stack direction="row" spacing={1} justifyContent="flex-end">
        <Button variant="outlined" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={submitting || !v.name.trim()}>
          {submitting ? 'Saving…' : 'Save'}
        </Button>
      </Stack>
    </Stack>
  );
}

type DrawerState = 'new' | TeamDto | null;

export function TeamsPage(): JSX.Element {
  const teamsQ = useTeams();
  const peopleQ = usePeople();
  const create = useCreateTeam();
  const update = useUpdateTeam();
  const del = useDeleteTeam();
  const [drawer, setDrawer] = useState<DrawerState>(null);

  const people = peopleQ.data ?? [];
  const personMap = new Map(people.map((p) => [p.id, p]));

  const isNew = drawer === 'new';
  const isPending = isNew ? create.isPending : update.isPending;

  function toFormValues(t: TeamDto): FormValues {
    return {
      name: t.name,
      description: t.description ?? '',
      members: t.memberIds.map((id) => personMap.get(id)).filter((p): p is PersonDto => !!p),
    };
  }

  async function handleSubmit(v: FormValues) {
    const body = {
      name: v.name.trim(),
      description: v.description.trim() || null,
      memberIds: v.members.map((p) => p.id),
    };
    if (isNew) {
      await create.mutateAsync(body);
    } else if (drawer) {
      await update.mutateAsync({ id: (drawer as TeamDto).id, body });
    }
    setDrawer(null);
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5">Teams</Typography>
        <Button startIcon={<AddIcon />} variant="contained" onClick={() => setDrawer('new')}>
          Add team
        </Button>
      </Stack>

      {teamsQ.isLoading && <Typography>Loading…</Typography>}
      {teamsQ.data?.length === 0 && (
        <EmptyState
          title="No teams yet"
          description="Create teams to enable group-level insights and tracking."
        />
      )}

      <Stack spacing={2}>
        {teamsQ.data?.map((t) => (
          <Card key={t.id} variant="outlined">
            <CardContent>
              <Typography variant="h6" sx={{ mb: t.description ? 0.5 : 1 }}>
                {t.name}
              </Typography>
              {t.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {t.description}
                </Typography>
              )}
              {t.memberIds.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No members</Typography>
              ) : (
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {t.memberIds.map((pid) => (
                    <Chip
                      key={pid}
                      label={personMap.get(pid)?.name ?? pid}
                      size="small"
                      variant="outlined"
                    />
                  ))}
                </Stack>
              )}
            </CardContent>
            <CardActions>
              <Button size="small" onClick={() => setDrawer(t)}>Edit</Button>
              <Button size="small" color="error" disabled={del.isPending} onClick={() => del.mutate(t.id)}>
                Delete
              </Button>
            </CardActions>
          </Card>
        ))}
      </Stack>

      <Drawer anchor="right" open={drawer !== null} onClose={() => setDrawer(null)}>
        <Box sx={{ width: 440, p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {isNew ? 'Add team' : 'Edit team'}
          </Typography>
          {drawer !== null && (
            <TeamForm
              initial={!isNew ? toFormValues(drawer as TeamDto) : undefined}
              people={people}
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
