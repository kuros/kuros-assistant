import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { ConnectorsPage } from './pages/ConnectorsPage';
import { ConnectorDailySummaryPage } from './pages/ConnectorDailySummaryPage';
import { DailySummaryPage } from './pages/DailySummaryPage';
import { RisksActionsPage } from './pages/RisksActionsPage';
import { ArchivePage } from './pages/ArchivePage';
import { PersonInsightsPage } from './pages/PersonInsightsPage';
import { TeamInsightsPage } from './pages/TeamInsightsPage';
import { PeoplePage } from './pages/PeoplePage';
import { TeamsPage } from './pages/TeamsPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { ProfilePage } from './pages/ProfilePage';
import { AiSettingsPage } from './pages/AiSettingsPage';
import { RequireOnboarding } from './layout/RequireOnboarding';
import { KnowledgeDashboardPage } from './pages/KnowledgeDashboardPage';
import { KnowledgeChatPage } from './pages/KnowledgeChatPage';
import { WikiPage } from './pages/WikiPage';
import { WikiGraphPage } from './pages/WikiGraphPage';

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
        { path: 'daily/connectors/:connectorId', element: <ConnectorDailySummaryPage /> },
        { path: 'weekly', element: <Navigate to="/daily" replace /> },
        { path: 'risks-actions', element: <RisksActionsPage /> },
        { path: 'archive', element: <ArchivePage /> },
        { path: 'insights/people', element: <PersonInsightsPage /> },
        { path: 'insights/people/:personId', element: <PersonInsightsPage /> },
        { path: 'insights/teams', element: <TeamInsightsPage /> },
        { path: 'insights/teams/:teamId', element: <TeamInsightsPage /> },
        { path: 'knowledge', element: <KnowledgeDashboardPage /> },
        { path: 'knowledge/ask', element: <KnowledgeChatPage /> },
        { path: 'knowledge/ask/:conversationId', element: <KnowledgeChatPage /> },
        { path: 'knowledge/wiki/*', element: <WikiPage /> },
        { path: 'knowledge/graph', element: <WikiGraphPage /> },
        { path: 'people', element: <PeoplePage /> },
        { path: 'teams', element: <TeamsPage /> },
        { path: 'connectors', element: <ConnectorsPage /> },
        { path: 'connectors/new', element: <ConnectorsPage /> },
        { path: 'connectors/:id', element: <ConnectorsPage /> },
        { path: 'settings/profile', element: <ProfilePage /> },
        { path: 'settings/ai', element: <AiSettingsPage /> },
      ],
    },
  ]);
}
