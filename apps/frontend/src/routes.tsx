import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { ConnectorsPage } from './pages/ConnectorsPage';
import { DailySummaryPage } from './pages/DailySummaryPage';
import { WeeklySummaryPage } from './pages/WeeklySummaryPage';
import { RisksActionsPage } from './pages/RisksActionsPage';
import { PersonInsightsPage } from './pages/PersonInsightsPage';
import { TeamInsightsPage } from './pages/TeamInsightsPage';

export function buildRouter(props: { mode: 'light' | 'dark'; onToggleMode: () => void }) {
  return createBrowserRouter([
    {
      path: '/',
      element: <AppShell mode={props.mode} onToggleMode={props.onToggleMode} />,
      children: [
        { index: true, element: <Navigate to="/daily" replace /> },
        { path: 'daily', element: <DailySummaryPage /> },
        { path: 'weekly', element: <WeeklySummaryPage /> },
        { path: 'risks-actions', element: <RisksActionsPage /> },
        { path: 'insights/people', element: <PersonInsightsPage /> },
        { path: 'insights/people/:personId', element: <PersonInsightsPage /> },
        { path: 'insights/teams', element: <TeamInsightsPage /> },
        { path: 'insights/teams/:teamId', element: <TeamInsightsPage /> },
        { path: 'connectors', element: <ConnectorsPage /> },
      ],
    },
  ]);
}
