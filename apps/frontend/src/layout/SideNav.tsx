import { List, ListItemButton, ListItemIcon, ListItemText, ListSubheader } from '@mui/material';
import { Link, useLocation } from 'react-router-dom';
import { nav } from './nav-config';

export function SideNav(): JSX.Element {
  const loc = useLocation();
  const current = loc.pathname + loc.search;
  return (
    <>
      {nav.map((group) => (
        <List
          key={group.group}
          dense
          subheader={
            <ListSubheader disableSticky sx={{ bgcolor: 'transparent', lineHeight: '32px' }}>
              {group.group}
            </ListSubheader>
          }
        >
          {group.items.map((item) => {
            const Icon = item.icon;
            const base = item.to.split('?')[0];
            const moreSpecific = group.items.some(
              (o) => o !== item && o.to.startsWith(base + '/') && loc.pathname.startsWith(o.to.split('?')[0]),
            );
            const selected =
              current === item.to ||
              current.startsWith(base + '?') ||
              (!item.to.includes('?') && loc.pathname.startsWith(base + '/') && !moreSpecific);
            return (
              <ListItemButton
                key={item.label}
                component={Link}
                to={item.to}
                selected={selected}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Icon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            );
          })}
        </List>
      ))}
    </>
  );
}
