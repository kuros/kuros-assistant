import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useUserSettings, useUpdateUserSettings, useTestApiKey } from '../api/hooks/settings';

const schema = z.object({
  anthropicApiKey: z.string().optional(),
  claudeModelFast: z.string().min(1, 'Required'),
  claudeModelDeep: z.string().min(1, 'Required'),
});
type FormValues = z.infer<typeof schema>;

export function AiSettingsPage() {
  const { data: settings, isLoading } = useUserSettings();
  const { mutateAsync, isPending, error } = useUpdateUserSettings();
  const { mutateAsync: testKey, isPending: isTesting, data: testResult, reset: resetTest } = useTestApiKey();
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { anthropicApiKey: '', claudeModelFast: '', claudeModelDeep: '' },
  });

  const currentKeyValue = watch('anthropicApiKey');

  useEffect(() => {
    if (settings) {
      reset({
        anthropicApiKey: '',
        claudeModelFast: settings.claudeModelFast,
        claudeModelDeep: settings.claudeModelDeep,
      });
      resetTest();
    }
  }, [settings, reset, resetTest]);

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

      <Divider sx={{ my: 3 }} />

      <Typography variant="h6" fontWeight={600} gutterBottom>
        Test Connection
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {currentKeyValue
          ? 'Tests the key entered above (not yet saved).'
          : settings?.hasAnthropicKey
          ? 'Tests the currently saved API key.'
          : 'No API key configured. Enter a key above and save it first.'}
      </Typography>

      <Button
        variant="outlined"
        onClick={() => testKey(currentKeyValue || undefined)}
        disabled={isTesting || (!currentKeyValue && !settings?.hasAnthropicKey)}
        sx={{ alignSelf: 'flex-start' }}
      >
        {isTesting ? <CircularProgress size={20} /> : 'Test Connection'}
      </Button>

      {testResult && (
        <Alert
          severity={testResult.ok ? 'success' : 'error'}
          icon={testResult.ok ? <CheckCircleOutlineIcon /> : <ErrorOutlineIcon />}
          sx={{ mt: 2 }}
        >
          {testResult.ok ? 'API key is valid and working.' : `Invalid key: ${testResult.error}`}
        </Alert>
      )}

      <Snackbar
        open={saved}
        autoHideDuration={3000}
        onClose={() => setSaved(false)}
        message="Settings saved"
      />
    </Box>
  );
}
