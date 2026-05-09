import TodayIcon from '@mui/icons-material/Today';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CalendarViewWeekIcon from '@mui/icons-material/CalendarViewWeek';
import PersonIcon from '@mui/icons-material/Person';
import GroupsIcon from '@mui/icons-material/Groups';
import CableIcon from '@mui/icons-material/Cable';
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
    ],
  },
  {
    group: 'This week',
    items: [{ label: 'Weekly summary', to: '/weekly', icon: CalendarViewWeekIcon }],
  },
  {
    group: 'Insights',
    items: [
      { label: 'People', to: '/insights/people', icon: PersonIcon },
      { label: 'Teams', to: '/insights/teams', icon: GroupsIcon },
    ],
  },
  {
    group: 'Settings',
    items: [{ label: 'Connectors', to: '/connectors', icon: CableIcon }],
  },
];
