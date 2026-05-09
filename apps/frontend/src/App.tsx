import { useMemo, useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { buildTheme } from './theme';
import { buildRouter } from './routes';

const STORAGE_KEY = 'kuros.theme';
type Mode = 'light' | 'dark';

function readMode(): Mode {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'dark' ? 'dark' : 'light';
}

export function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>(readMode());
  const theme = useMemo(() => buildTheme(mode), [mode]);
  const queryClient = useMemo(() => new QueryClient(), []);
  const router = useMemo(
    () =>
      buildRouter({
        mode,
        onToggleMode: () => {
          setMode((prev) => {
            const next: Mode = prev === 'dark' ? 'light' : 'dark';
            localStorage.setItem(STORAGE_KEY, next);
            return next;
          });
        },
      }),
    [mode],
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
