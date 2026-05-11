import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material';
import { useUpdateMe, useMe } from '../api/hooks/me';
import { useState } from 'react';

const TIMEZONES = Intl.supportedValuesOf('timeZone');

const schema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  timezone: z.string().min(1),
});
type FormValues = z.infer<typeof schema>;

export function ProfilePage() {
  const { data: me, isLoading } = useMe();
  const { mutateAsync, isPending, error } = useUpdateMe();
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', timezone: 'UTC' },
  });

  useEffect(() => {
    if (me) reset({ name: me.name ?? '', email: me.email ?? '', timezone: me.timezone ?? 'UTC' });
  }, [me, reset]);

  if (isLoading) return null;

  async function onSubmit(values: FormValues) {
    await mutateAsync(values);
    setSaved(true);
  }

  return (
    <Box sx={{ maxWidth: 520, mx: 'auto', mt: 4, p: 2 }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Profile
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(error as Error).message}
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
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
            'Used to detect when you are mentioned or addressed directly.'
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
        <Button type="submit" variant="contained" disabled={isPending} sx={{ alignSelf: 'flex-start' }}>
          {isPending ? <CircularProgress size={20} /> : 'Save'}
        </Button>
      </Box>

      <Snackbar
        open={saved}
        autoHideDuration={3000}
        onClose={() => setSaved(false)}
        message="Profile saved"
      />
    </Box>
  );
}
