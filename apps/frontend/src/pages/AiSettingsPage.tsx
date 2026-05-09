import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { useUserSettings, useUpdateUserSettings } from '../api/hooks/settings';

const schema = z.object({
  anthropicApiKey: z.string().optional(),
  claudeModelFast: z.string().min(1, 'Required'),
  claudeModelDeep: z.string().min(1, 'Required'),
});
type FormValues = z.infer<typeof schema>;

export function AiSettingsPage() {
  const { data: settings, isLoading } = useUserSettings();
  const { mutateAsync, isPending, error } = useUpdateUserSettings();
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { anthropicApiKey: '', claudeModelFast: '', claudeModelDeep: '' },
  });

  useEffect(() => {
    if (settings) {
      reset({
        anthropicApiKey: '',
        claudeModelFast: settings.claudeModelFast,
        claudeModelDeep: settings.claudeModelDeep,
      });
    }
  }, [settings, reset]);

  if (isLoading) return null;

  async function onSubmit(values: FormValues) {
    const payload: { anthropicApiKey?: string; claudeModelFast: string; claudeModelDeep: string } = {
      claudeModelFast: values.claudeModelFast,
      claudeModelDeep: values.claudeModelDeep,
    };
    if (values.anthropicApiKey && values.anthropicApiKey.length > 0) {
      payload.anthropicApiKey = values.anthropicApiKey;
    }
    await mutateAsync(payload);
    reset({ anthropicApiKey: '', claudeModelFast: values.claudeModelFast, claudeModelDeep: values.claudeModelDeep });
    setSaved(true);
  }

  return (
    <Box sx={{ maxWidth: 520, mx: 'auto', mt: 4, p: 2 }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        AI Settings
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(error as Error).message}
        </Alert>
      )}

      <Box
        component="form"
        onSubmit={handleSubmit(onSubmit)}
        sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}
      >
        <TextField
          label="Anthropic API Key"
          type={showKey ? 'text' : 'password'}
          {...register('anthropicApiKey')}
          placeholder={settings?.hasAnthropicKey ? 'sk-ant-••••••••' : 'sk-ant-...'}
          error={!!errors.anthropicApiKey}
          helperText={
            errors.anthropicApiKey?.message ??
            (settings?.hasAnthropicKey ? 'Leave blank to keep existing key' : undefined)
          }
          fullWidth
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={() => setShowKey((v) => !v)} edge="end" aria-label="toggle key visibility">
                  {showKey ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        <TextField
          label="Fast model"
          {...register('claudeModelFast')}
          error={!!errors.claudeModelFast}
          helperText={errors.claudeModelFast?.message ?? 'Used for summaries and extraction (e.g. claude-sonnet-4-6)'}
          fullWidth
        />
        <TextField
          label="Deep model"
          {...register('claudeModelDeep')}
          error={!!errors.claudeModelDeep}
          helperText={errors.claudeModelDeep?.message ?? 'Used for insights (e.g. claude-opus-4-7)'}
          fullWidth
        />
        <Button
          type="submit"
          variant="contained"
          disabled={isPending}
          sx={{ alignSelf: 'flex-start' }}
        >
          {isPending ? <CircularProgress size={20} /> : 'Save'}
        </Button>
      </Box>

      <Snackbar
        open={saved}
        autoHideDuration={3000}
        onClose={() => setSaved(false)}
        message="Settings saved"
      />
    </Box>
  );
}
