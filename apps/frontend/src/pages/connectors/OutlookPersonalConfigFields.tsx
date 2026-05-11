import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useFormContext } from 'react-hook-form';

interface Step {
  title: string;
  details: React.ReactNode[];
}

const STEPS: Step[] = [
  {
    title: 'Sign in to Azure Portal',
    details: [
      <>
        Open{' '}
        <a href="https://portal.azure.com" target="_blank" rel="noreferrer">
          portal.azure.com
        </a>{' '}
        in your browser. You can sign in with <em>any</em> Microsoft account — a personal
        outlook.com account works fine.
      </>,
    ],
  },
  {
    title: 'Create a new App Registration',
    details: [
      <>
        In the top search bar type <strong>App registrations</strong> and select it from the
        results.
      </>,
      <>
        Click <strong>+ New registration</strong>.
      </>,
      <>
        Fill in the form:
        <Box component="ul" sx={{ mt: 0.5, mb: 0, pl: 2.5 }}>
          <li>
            <strong>Name</strong> — any label, e.g. <em>Kuros Mail Connector</em>
          </li>
          <li>
            <strong>Supported account types</strong> — select{' '}
            <strong>
              Personal Microsoft accounts only
            </strong>{' '}
            (the last option — "Accounts in personal Microsoft account, e.g. Skype, Xbox")
          </li>
          <li>
            <strong>Redirect URI</strong> — leave blank for now
          </li>
        </Box>
      </>,
      <>
        Click <strong>Register</strong>.
      </>,
    ],
  },
  {
    title: 'Copy the Client ID',
    details: [
      <>
        After registration you land on the <strong>Overview</strong> page. Copy the value next to{' '}
        <strong>Application (client) ID</strong> — paste it in the <em>Client ID</em> field below.
      </>,
    ],
  },
  {
    title: 'Enable device-code sign-in',
    details: [
      <>
        In the left sidebar click <strong>Authentication</strong>.
      </>,
      <>
        Click <strong>+ Add a platform</strong> → choose{' '}
        <strong>Mobile and desktop applications</strong>.
      </>,
      <>
        Under <em>Custom redirect URIs</em>, tick the pre-filled entry:
        <Box
          component="code"
          sx={{
            display: 'block',
            mt: 0.5,
            p: 0.75,
            bgcolor: 'action.hover',
            borderRadius: 1,
            fontSize: '0.75rem',
            wordBreak: 'break-all',
          }}
        >
          https://login.microsoftonline.com/common/oauth2/nativeclient
        </Box>
      </>,
      <>
        Click <strong>Configure</strong>.
      </>,
      <>
        Back on the Authentication page scroll down to{' '}
        <strong>Advanced settings</strong>. Set{' '}
        <strong>Allow public client flows</strong> to <strong>Yes</strong>, then click{' '}
        <strong>Save</strong>.
      </>,
    ],
  },
  {
    title: 'Add API permissions',
    details: [
      <>
        In the left sidebar click <strong>API permissions</strong>.
      </>,
      <>
        Click <strong>+ Add a permission → Microsoft Graph → Delegated permissions</strong>.
      </>,
      <>
        Search for and add both:
        <Box sx={{ mt: 0.5, display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          <Chip label="Mail.Read" size="small" variant="outlined" />
          <Chip label="offline_access" size="small" variant="outlined" />
        </Box>
      </>,
      <>
        Click <strong>Add permissions</strong>. No admin consent is required for personal accounts.
      </>,
    ],
  },
  {
    title: 'Complete sign-in via device code',
    details: [
      <>
        Fill in the <em>Client ID</em> and <em>email address</em> fields below and click{' '}
        <strong>Save</strong>.
      </>,
      <>
        Click <strong>Test</strong> on the connector card — a device code and URL will appear in
        the response.
      </>,
      <>
        Open the URL in a browser, enter the code, and sign in with your personal Microsoft
        account. Authentication is complete once the test returns success.
      </>,
    ],
  },
];

function SetupSteps() {
  return (
    <Accordion disableGutters variant="outlined" sx={{ borderRadius: 1 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="body2" fontWeight={600}>
          How to register an Azure app for personal Microsoft accounts
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        <Stack spacing={0} divider={<Divider />}>
          {STEPS.map((step, i) => (
            <Box key={i} sx={{ py: 1.5 }}>
              <Stack direction="row" spacing={1.5} alignItems="flex-start">
                <Box
                  sx={{
                    minWidth: 22,
                    height: 22,
                    borderRadius: '50%',
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    mt: 0.1,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </Box>
                <Box>
                  <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                    {step.title}
                  </Typography>
                  <Stack spacing={0.5}>
                    {step.details.map((d, j) => (
                      <Typography key={j} variant="body2" color="text.secondary">
                        {d}
                      </Typography>
                    ))}
                  </Stack>
                </Box>
              </Stack>
            </Box>
          ))}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

export function OutlookPersonalConfigFields(): JSX.Element {
  const { register } = useFormContext();
  return (
    <Stack spacing={2}>
      <SetupSteps />
      <Divider />
      <TextField
        label="Client ID"
        fullWidth
        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        helperText="Application (client) ID from the Overview page of your app registration"
        {...register('config.clientId')}
      />
      <TextField
        label="Your email address"
        fullWidth
        type="email"
        placeholder="you@outlook.com"
        helperText="Your personal Microsoft account (outlook.com, hotmail.com, live.com)"
        {...register('config.emailAddress')}
      />
      <TextField
        label="Fetch emails from (optional)"
        fullWidth
        type="date"
        InputLabelProps={{ shrink: true }}
        helperText="Leave blank to start from the last 7 days"
        {...register('config.startDate')}
      />
    </Stack>
  );
}
