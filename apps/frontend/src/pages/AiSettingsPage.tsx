import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Radio,
  RadioGroup,
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
  claudeEffortFast: z.enum(['low', 'medium', 'high']),
  claudeEffortDeep: z.enum(['low', 'medium', 'high']),
  aiProvider: z.enum(['api', 'claude_code']),
});

const EFFORT_OPTIONS = ['low', 'medium', 'high'] as const;
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
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      anthropicApiKey: '',
      claudeModelFast: '',
      claudeModelDeep: '',
      claudeEffortFast: 'low',
      claudeEffortDeep: 'high',
      aiProvider: 'api',
    },
  });

  const currentKeyValue = watch('anthropicApiKey');
  const currentProvider = watch('aiProvider');

  useEffect(() => {
    if (settings) {
      reset({
        anthropicApiKey: '',
        claudeModelFast: settings.claudeModelFast,
        claudeModelDeep: settings.claudeModelDeep,
        claudeEffortFast: settings.claudeEffortFast,
        claudeEffortDeep: settings.claudeEffortDeep,
        aiProvider: settings.aiProvider,
      });
      resetTest();
    }
  }, [settings, reset, resetTest]);

  if (isLoading) return null;

  async function onSubmit(values: FormValues) {
    const payload: {
      anthropicApiKey?: string;
      claudeModelFast: string;
      claudeModelDeep: string;
      claudeEffortFast: 'low' | 'medium' | 'high';
      claudeEffortDeep: 'low' | 'medium' | 'high';
      aiProvider: 'api' | 'claude_code';
    } = {
      claudeModelFast: values.claudeModelFast,
      claudeModelDeep: values.claudeModelDeep,
      claudeEffortFast: values.claudeEffortFast,
      claudeEffortDeep: values.claudeEffortDeep,
      aiProvider: values.aiProvider,
    };
    if (values.anthropicApiKey && values.anthropicApiKey.length > 0) {
      payload.anthropicApiKey = values.anthropicApiKey;
    }
    await mutateAsync(payload);
    reset({
      anthropicApiKey: '',
      claudeModelFast: values.claudeModelFast,
      claudeModelDeep: values.claudeModelDeep,
      claudeEffortFast: values.claudeEffortFast,
      claudeEffortDeep: values.claudeEffortDeep,
      aiProvider: values.aiProvider,
    });
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
        <Controller
          name="aiProvider"
          control={control}
          render={({ field }) => (
            <FormControl>
              <FormLabel>AI provider</FormLabel>
              <RadioGroup row {...field}>
                <FormControlLabel value="api" control={<Radio />} label="Anthropic API" />
                <FormControlLabel
                  value="claude_code"
                  control={<Radio />}
                  label="Claude Code (local CLI)"
                />
              </RadioGroup>
              <FormHelperText>
                {currentProvider === 'claude_code'
                  ? 'Summaries run via the `claude` CLI on this machine using your Claude.ai subscription. No API key needed.'
                  : 'Summaries call the Anthropic API directly. Requires an API key below.'}
              </FormHelperText>
            </FormControl>
          )}
        />

        <TextField
          label="Anthropic API Key"
          type={showKey ? 'text' : 'password'}
          {...register('anthropicApiKey')}
          placeholder={settings?.hasAnthropicKey ? 'sk-ant-••••••••' : 'sk-ant-...'}
          disabled={currentProvider === 'claude_code'}
          error={!!errors.anthropicApiKey}
          helperText={
            errors.anthropicApiKey?.message ??
            (currentProvider === 'claude_code'
              ? 'Not used when Claude Code is selected.'
              : settings?.hasAnthropicKey
              ? 'Leave blank to keep existing key'
              : undefined)
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
        <Controller
          name="claudeEffortFast"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              select
              label="Fast effort"
              error={!!errors.claudeEffortFast}
              helperText={
                errors.claudeEffortFast?.message ??
                'Reasoning effort for the fast tier — lower spends fewer tokens'
              }
              fullWidth
            >
              {EFFORT_OPTIONS.map((opt) => (
                <MenuItem key={opt} value={opt}>
                  {opt}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        <TextField
          label="Deep model"
          {...register('claudeModelDeep')}
          error={!!errors.claudeModelDeep}
          helperText={errors.claudeModelDeep?.message ?? 'Used for insights (e.g. claude-opus-4-7)'}
          fullWidth
        />
        <Controller
          name="claudeEffortDeep"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              select
              label="Deep effort"
              error={!!errors.claudeEffortDeep}
              helperText={
                errors.claudeEffortDeep?.message ??
                'Reasoning effort for the deep tier — higher spends more tokens for better quality'
              }
              fullWidth
            >
              {EFFORT_OPTIONS.map((opt) => (
                <MenuItem key={opt} value={opt}>
                  {opt}
                </MenuItem>
              ))}
            </TextField>
          )}
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
        {currentProvider === 'claude_code'
          ? 'API key testing is disabled when Claude Code is selected.'
          : currentKeyValue
          ? 'Tests the key entered above (not yet saved).'
          : settings?.hasAnthropicKey
          ? 'Tests the currently saved API key.'
          : 'No API key configured. Enter a key above and save it first.'}
      </Typography>

      <Button
        variant="outlined"
        onClick={() => testKey(currentKeyValue || undefined)}
        disabled={
          isTesting ||
          currentProvider === 'claude_code' ||
          (!currentKeyValue && !settings?.hasAnthropicKey)
        }
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
