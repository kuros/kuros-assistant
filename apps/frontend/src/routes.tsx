import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { ConnectorsPage } from './pages/ConnectorsPage';
import { DailySummaryPage } from './pages/DailySummaryPage';
import { WeeklySummaryPage } from './pages/WeeklySummaryPage';
import { RisksActionsPage } from './pages/RisksActionsPage';
import { PersonInsightsPage } from './pages/PersonInsightsPage';
import { TeamInsightsPage } from './pages/TeamInsightsPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { ProfilePage } from './pages/ProfilePage';
import { AiSettingsPage } from './pages/AiSettingsPage';
import { RequireOnboarding } from './layout/RequireOnboarding';

export function buildRouter(props: { mode: 'light' | 'dark'; onToggleMode: () => void }) {
  return createBrowserRouter([
    {
      path: '/onboarding',
      element: <OnboardingPage />,
    },
    {
      path: '/',
      element: (
        <RequireOnboarding>
          <AppShell mode={props.mode} onToggleMode={props.onToggleMode} />
        </RequireOnboarding>
      ),
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
        { path: 'connectors/new', element: <ConnectorsPage /> },
        { path: 'connectors/:id', element: <ConnectorsPage /> },
        { path: 'settings/profile', element: <ProfilePage /> },
        { path: 'settings/ai', element: <AiSettingsPage /> },
      ],
    },
  ]);
}
