import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  TextField,
  Typography,
} from '@mui/material';
import { useUpdateMe, useMe } from '../api/hooks/me';

const TIMEZONES = Intl.supportedValuesOf('timeZone');

const schema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  timezone: z.string().min(1),
});
type FormValues = z.infer<typeof schema>;

export function OnboardingPage() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const { mutateAsync, isPending, error } = useUpdateMe();

  const defaultTz =
    (me?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: me?.name ?? '', email: me?.email ?? '', timezone: defaultTz },
  });

  useEffect(() => {
    if (me?.onboarded) navigate('/connectors', { replace: true });
  }, [me, navigate]);

  async function onSubmit(values: FormValues) {
    await mutateAsync(values);
    navigate('/connectors', { replace: true });
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Card sx={{ maxWidth: 480, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Welcome to Kuros Manager
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Let's set up your profile before we start syncing your data.
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {(error as Error).message}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Display name"
              {...register('name')}
              error={!!errors.name}
              helperText={errors.name?.message}
              fullWidth
            />
            <TextField
              label="Work email"
              type="email"
              {...register('email')}
              error={!!errors.email}
              helperText={
                errors.email?.message ??
                'Used to detect when you are mentioned or addressed directly in messages.'
              }
              fullWidth
            />
            <Controller
              name="timezone"
              control={control}
              render={({ field, fieldState }) => (
                <Autocomplete
                  options={TIMEZONES}
                  value={field.value}
                  onChange={(_, v) => field.onChange(v ?? '')}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Timezone"
                      error={!!fieldState.error}
                      helperText={fieldState.error?.message}
                    />
                  )}
                />
              )}
            />
            <Button type="submit" variant="contained" size="large" disabled={isPending}>
              {isPending ? <CircularProgress size={20} /> : 'Get started'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
