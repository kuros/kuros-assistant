import TodayIcon from '@mui/icons-material/Today';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ArchiveIcon from '@mui/icons-material/Archive';
import CalendarViewWeekIcon from '@mui/icons-material/CalendarViewWeek';
import PersonIcon from '@mui/icons-material/Person';
import GroupsIcon from '@mui/icons-material/Groups';
import PeopleIcon from '@mui/icons-material/People';
import WorkspacesIcon from '@mui/icons-material/Workspaces';
import CableIcon from '@mui/icons-material/Cable';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import type { SvgIconComponent } from '@mui/icons-material';

export interface NavItem {
  label: string;
  to: string;
  icon: SvgIconComponent;
}
export interface NavGroup {
  group: string;
  items: NavItem[];
}

export const nav: NavGroup[] = [
  {
    group: 'Today',
    items: [
      { label: 'Daily summary', to: '/daily', icon: TodayIcon },
      { label: 'Action items', to: '/risks-actions?tab=actions', icon: CheckBoxIcon },
      { label: 'Risks', to: '/risks-actions?tab=risks', icon: WarningAmberIcon },
      { label: 'Archive', to: '/archive', icon: ArchiveIcon },
    ],
  },
  {
    group: 'This week',
    items: [{ label: 'Weekly summary', to: '/weekly', icon: CalendarViewWeekIcon }],
  },
  {
    group: 'Directory',
    items: [
      { label: 'People', to: '/people', icon: PeopleIcon },
      { label: 'Teams', to: '/teams', icon: WorkspacesIcon },
    ],
  },
  {
    group: 'Insights',
    items: [
      { label: 'Person insights', to: '/insights/people', icon: PersonIcon },
      { label: 'Team insights', to: '/insights/teams', icon: GroupsIcon },
    ],
  },
  {
    group: 'Settings',
    items: [
      { label: 'Connectors', to: '/connectors', icon: CableIcon },
      { label: 'Profile', to: '/settings/profile', icon: AccountCircleIcon },
      { label: 'AI', to: '/settings/ai', icon: SmartToyOutlinedIcon },
    ],
  },
];
