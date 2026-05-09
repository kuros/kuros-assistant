import { Stack, TextField, Typography } from '@mui/material';
import { Controller, useFormContext } from 'react-hook-form';

export function SlackConfigFields(): JSX.Element {
  const { control, register } = useFormContext();
  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Slack Socket Mode tokens. Bot token starts with <code>xoxb-</code>, app token with <code>xapp-</code>.
      </Typography>
      <TextField
        label="Bot token"
        fullWidth
        type="password"
        autoComplete="new-password"
        {...register('config.botToken')}
      />
      <TextField
        label="App token"
        fullWidth
        type="password"
        autoComplete="new-password"
        {...register('config.appToken')}
      />
      <TextField label="Team ID" fullWidth {...register('config.teamId')} />
      <Controller
        control={control}
        name="config.channelIds"
        render={({ field }) => (
          <TextField
            label="Channel IDs (comma-separated)"
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
