import { AppBar, Box, CssBaseline, Divider, Drawer, IconButton, Toolbar, Typography, useTheme } from '@mui/material';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import { Outlet } from 'react-router-dom';
import { SideNav } from './SideNav';
import { IngestionIndicator } from '../components/IngestionProgress';
import { SummaryBackfillIndicator } from '../components/SummaryBackfill';

const DRAWER_WIDTH = 240;

export interface AppShellProps {
  mode: 'light' | 'dark';
  onToggleMode: () => void;
}

export function AppShell({ mode, onToggleMode }: AppShellProps): JSX.Element {
  const theme = useTheme();
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{ zIndex: theme.zIndex.drawer + 1, bgcolor: 'background.paper', color: 'text.primary' }}
        elevation={0}
      >
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 600 }}>
            Kuros Assistant
          </Typography>
          <SummaryBackfillIndicator />
          <IngestionIndicator />
          <IconButton onClick={onToggleMode} color="inherit" aria-label="toggle theme">
            {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
          </IconButton>
        </Toolbar>
        <Divider />
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', py: 1 }}>
          <SideNav />
        </Box>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
