import { createTheme } from '@mui/material/styles';

export function buildTheme(mode: 'light' | 'dark') {
  return createTheme({
    palette: {
      mode,
    },
    shape: { borderRadius: 8 },
    typography: {
      fontFamily:
        '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    },
  });
}
