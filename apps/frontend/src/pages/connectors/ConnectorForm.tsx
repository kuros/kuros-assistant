import { Button, MenuItem, Stack, TextField } from '@mui/material';
import { FormProvider, useForm } from 'react-hook-form';
import type { ConnectorKind, CreateConnectorRequest } from '@kuros/shared';
import { SlackConfigFields } from './SlackConfigFields';
import { OutlookConfigFields } from './OutlookConfigFields';

export interface ConnectorFormValues {
  kind: ConnectorKind;
  name: string;
  config: Record<string, unknown>;
}

export function ConnectorForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: Partial<ConnectorFormValues>;
  onSubmit: (values: CreateConnectorRequest) => void;
  onCancel: () => void;
  submitting?: boolean;
}): JSX.Element {
  const methods = useForm<ConnectorFormValues>({
    defaultValues: {
      kind: initial?.kind ?? 'slack',
      name: initial?.name ?? '',
      config: initial?.config ?? {},
    },
  });
  const kind = methods.watch('kind');

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={methods.handleSubmit((v) =>
          onSubmit({ kind: v.kind, name: v.name, config: v.config as never }),
        )}
      >
        <Stack spacing={2}>
          <TextField
            select
            label="Kind"
            {...methods.register('kind')}
            value={kind}
            onChange={(e) => methods.setValue('kind', e.target.value as ConnectorKind)}
          >
            <MenuItem value="slack">Slack</MenuItem>
            <MenuItem value="outlook">Outlook</MenuItem>
          </TextField>
          <TextField label="Name" fullWidth {...methods.register('name', { required: true })} />
          {kind === 'slack' ? <SlackConfigFields /> : <OutlookConfigFields />}
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={onCancel}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={submitting}>
              Save
            </Button>
          </Stack>
        </Stack>
      </form>
    </FormProvider>
  );
}
