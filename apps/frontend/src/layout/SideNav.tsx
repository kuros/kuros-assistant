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
            const selected = current === item.to || current.startsWith(item.to.split('?')[0] + '?') ;
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
