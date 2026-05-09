import { Stack, TextField, Typography } from '@mui/material';
import { Controller, useFormContext } from 'react-hook-form';

export function OutlookConfigFields(): JSX.Element {
  const { control, register } = useFormContext();
  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Microsoft Graph (delegated) via MSAL device-code flow.
      </Typography>
      <TextField label="Tenant ID" fullWidth defaultValue="common" {...register('config.tenantId')} />
      <TextField label="Client ID" fullWidth {...register('config.clientId')} />
      <TextField
        label="Token cache file (relative)"
        fullWidth
        helperText="e.g. users/<userId>/outlook/tokens/<connectorId>.json"
        {...register('config.cachedTokenFilePath')}
      />
      <Controller
        control={control}
        name="config.monitoredAddresses"
        render={({ field }) => (
          <TextField
            label="Monitored addresses (comma-separated)"
            fullWidth
            value={Array.isArray(field.value) ? field.value.join(', ') : (field.value ?? '')}
            onChange={(e) =>
              field.onChange(
                e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
          />
        )}
      />
    </Stack>
  );
}
