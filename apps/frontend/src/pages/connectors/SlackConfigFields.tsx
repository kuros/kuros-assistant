import { useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useController, useFormContext } from 'react-hook-form';

const STEPS = [
  <>
    <strong>Option A — Personal token (simpler):</strong> Go to{' '}
    <strong>api.slack.com/apps</strong> → create an app → under{' '}
    <strong>OAuth &amp; Permissions → User Token Scopes</strong> add:{' '}
    <code>channels:history</code>, <code>channels:read</code>, <code>groups:history</code>,{' '}
    <code>groups:read</code>, <code>im:history</code>, <code>mpim:history</code>,{' '}
    <code>users:read</code>, <code>users:read.email</code>. Install the app and copy the{' '}
    <strong>User OAuth Token</strong> (starts with <code>xoxp-</code>).
  </>,
  <>
    <strong>Option B — Bot token:</strong> Same app setup but add the same scopes under{' '}
    <strong>Bot Token Scopes</strong> instead. Copy the{' '}
    <strong>Bot User OAuth Token</strong> (starts with <code>xoxb-</code>) and invite the bot to
    each channel with <code>/invite @yourbot</code>.
  </>,
  <>Find your <strong>Team ID</strong>: open Slack in a browser — the URL segment starting with <code>T</code> is the Team ID.</>,
  <>Find <strong>Channel IDs</strong>: right-click a channel → <strong>View channel details</strong> → copy the ID at the bottom (starts with <code>C</code> or <code>G</code>).</>,
];

function SetupSteps() {
  return (
    <Accordion disableGutters variant="outlined" sx={{ borderRadius: 1 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="body2" fontWeight={600}>
          How to get a Slack token
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
          {STEPS.map((step, i) => (
            <Box component="li" key={i} sx={{ mb: 1 }}>
              <Typography variant="body2">{step}</Typography>
            </Box>
          ))}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}

function ChannelIdsInput(): JSX.Element {
  const { control } = useFormContext();
  const { field } = useController({ control, name: 'config.channelIds' });
  const [raw, setRaw] = useState<string>(
    Array.isArray(field.value) ? field.value.join(', ') : String(field.value ?? ''),
  );

  return (
    <TextField
      label="Channel IDs (comma-separated)"
      fullWidth
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={() =>
        field.onChange(raw.split(',').map((s) => s.trim()).filter(Boolean))
      }
    />
  );
}

export function SlackConfigFields(): JSX.Element {
  const { register } = useFormContext();
  return (
    <Stack spacing={2}>
      <SetupSteps />
      <Divider />
      <Typography variant="body2" color="text.secondary">
        Paste a bot token (<code>xoxb-</code>) or personal user token (<code>xoxp-</code>).
      </Typography>
      <TextField
        label="Slack token"
        fullWidth
        type="password"
        autoComplete="new-password"
        {...register('config.token')}
      />
      <TextField label="Team ID" fullWidth {...register('config.teamId')} />
      <ChannelIdsInput />
    </Stack>
  );
}
