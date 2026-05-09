import { Chip } from '@mui/material';

const COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'> = {
  active: 'success',
  paused: 'warning',
  error: 'error',
  open: 'info',
  in_progress: 'primary',
  done: 'success',
  dismissed: 'default',
  mitigated: 'success',
  accepted: 'default',
  closed: 'default',
  low: 'default',
  medium: 'info',
  high: 'warning',
  critical: 'error',
};

export function StatusChip({ value }: { value: string }): JSX.Element {
  return <Chip size="small" label={value} color={COLORS[value] ?? 'default'} variant="outlined" />;
}
