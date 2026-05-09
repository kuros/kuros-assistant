import { Box, Typography } from '@mui/material';

export function EmptyState({ title, description }: { title: string; description?: string }): JSX.Element {
  return (
    <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
      <Typography variant="h6">{title}</Typography>
      {description ? <Typography variant="body2" sx={{ mt: 1 }}>{description}</Typography> : null}
    </Box>
  );
}
