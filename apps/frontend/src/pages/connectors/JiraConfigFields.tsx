import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Controller, useFormContext } from 'react-hook-form';

const STEPS = [
  <>Go to your Jira instance → <strong>Account settings → Security → API tokens</strong> → <strong>Create and manage API tokens</strong>.</>,
  <>Click <strong>Create API token</strong>, give it a label, and copy the generated token.</>,
  <>Your <strong>Base URL</strong> is your Jira instance root, e.g. <code>https://yourcompany.atlassian.net</code>.</>,
  <>Find <strong>Project Keys</strong> by opening a project in Jira — the key appears in the URL and issue IDs (e.g. <code>ENG</code> in <code>ENG-123</code>).</>,
];

function SetupSteps() {
  return (
    <Accordion disableGutters variant="outlined" sx={{ borderRadius: 1 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="body2" fontWeight={600}>
          How to create a Jira API token
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

const INVOLVING_ME = 'assignee = currentUser() OR reporter = currentUser() OR watcher = currentUser()';

export function JiraConfigFields(): JSX.Element {
  const { control, register, setValue } = useFormContext();
  return (
    <Stack spacing={2}>
      <SetupSteps />
      <Divider />
      <Typography variant="body2" color="text.secondary">
        Jira Cloud credentials. The API token is tied to your Atlassian account email.
      </Typography>
      <TextField
        label="Base URL"
        fullWidth
        placeholder="https://yourcompany.atlassian.net"
        {...register('config.baseUrl')}
      />
      <TextField
        label="Email"
        fullWidth
        type="email"
        autoComplete="email"
        {...register('config.email')}
      />
      <TextField
        label="API token"
        fullWidth
        type="password"
        autoComplete="new-password"
        {...register('config.apiToken')}
      />
      <Controller
        control={control}
        name="config.projectKeys"
        render={({ field }) => (
          <TextField
            label="Project keys (comma-separated)"
            fullWidth
            placeholder="ENG, OPS, DESIGN"
            value={Array.isArray(field.value) ? field.value.join(', ') : (field.value ?? '')}
            onChange={(e) =>
              field.onChange(
                e.target.value
                  .split(',')
                  .map((s) => s.trim().toUpperCase())
                  .filter(Boolean),
              )
            }
          />
        )}
      />
      <Divider />
      <Typography variant="body2" fontWeight={600}>
        Which issues to sync
      </Typography>
      <Typography variant="body2" color="text.secondary">
        By default every issue updated in these projects is synced and summarised, which can be hundreds a day. Narrow it
        with a JQL filter to cut summary cost. It is added to the project query as <code>AND (…)</code> and applies to
        future syncs. Use <strong>Test</strong> after saving to check it.
      </Typography>
      <Controller
        control={control}
        name="config.jqlFilter"
        render={({ field }) => (
          <TextField
            label="JQL filter (optional)"
            fullWidth
            multiline
            minRows={2}
            placeholder={INVOLVING_ME}
            helperText="Leave empty to sync every updated issue. Don't include ORDER BY."
            value={field.value ?? ''}
            onChange={(e) => field.onChange(e.target.value)}
            InputProps={{ sx: { fontFamily: 'monospace', fontSize: 13 } }}
          />
        )}
      />
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="outlined" onClick={() => setValue('config.jqlFilter', INVOLVING_ME, { shouldDirty: true })}>
          Only issues involving me
        </Button>
        <Button size="small" onClick={() => setValue('config.jqlFilter', '', { shouldDirty: true })}>
          Sync everything
        </Button>
      </Stack>
    </Stack>
  );
}
