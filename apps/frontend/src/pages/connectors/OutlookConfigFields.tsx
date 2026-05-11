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
import { Controller, useFormContext } from 'react-hook-form';

const STEPS = [
  <>Go to <strong>portal.azure.com</strong> → <strong>Azure Active Directory → App registrations → New registration</strong>. Give it a name and choose the appropriate account type.</>,
  <>Under <strong>Authentication → Add a platform → Mobile and desktop applications</strong>, add redirect URI: <code>https://login.microsoftonline.com/common/oauth2/nativeclient</code>. Enable <strong>Allow public client flows</strong>.</>,
  <>Under <strong>API permissions → Add a permission → Microsoft Graph → Delegated</strong>, add: <code>Mail.Read</code> and <code>offline_access</code>. Grant admin consent if required.</>,
  <>From the <strong>Overview</strong> page, copy the <strong>Application (client) ID</strong> and <strong>Directory (tenant) ID</strong>.</>,
  <>Set the <strong>Token cache file</strong> path (e.g. <code>users/&lt;userId&gt;/outlook/tokens/&lt;connectorId&gt;.json</code>). This file is created automatically after the first device-code sign-in.</>,
  <>After saving the connector, click <strong>Test</strong> — it will display a device code. Visit the URL shown and enter the code to authenticate.</>,
];

function SetupSteps() {
  return (
    <Accordion disableGutters variant="outlined" sx={{ borderRadius: 1 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="body2" fontWeight={600}>
          How to register an Azure AD app
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

export function OutlookConfigFields(): JSX.Element {
  const { control, register } = useFormContext();
  return (
    <Stack spacing={2}>
      <SetupSteps />
      <Divider />
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
