import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Collapse,
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
  Slider,
  Stack,
  Switch,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import type { WikiGraphNode, WikiPageType } from '@kuros/shared';
import { useWikiGraph } from '../api/hooks/knowledge';
import {
  DEFAULT_FILTERS,
  DEFAULT_FORCES,
  TYPE_STYLE,
  UNRESOLVED_STYLE,
  WikiGraph,
  type GraphFilters,
  type GraphForces,
  type NodeShape,
} from '../components/WikiGraph';
import { EmptyState } from '../components/EmptyState';

const LEGEND_ORDER: WikiPageType[] = ['person', 'team', 'project', 'topic', 'daily', 'answer', 'source'];

const SWATCH_PATH: Record<NodeShape, string> = {
  circle: 'M7 2a5 5 0 1 1 0 10a5 5 0 1 1 0-10z',
  ring: 'M7 2a5 5 0 1 1 0 10a5 5 0 1 1 0-10z',
  square: 'M2.5 2.5h9v9h-9z',
  diamond: 'M7 1l6 6l-6 6l-6-6z',
  triangle: 'M7 1.5l5.5 10h-11z',
};

function LegendSwatch({ shape, color }: { shape: NodeShape; color: string }): JSX.Element {
  const ring = shape === 'ring';
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden style={{ flexShrink: 0 }}>
      <path d={SWATCH_PATH[shape]} fill={ring ? 'none' : color} stroke={ring ? color : 'none'} strokeWidth={1.5} />
    </svg>
  );
}

export function WikiGraphPage(): JSX.Element {
  const theme = useTheme();
  const mode = theme.palette.mode;
  const graph = useWikiGraph();
  const [filters, setFilters] = useState<GraphFilters>(DEFAULT_FILTERS);
  const [forces, setForces] = useState<GraphForces>(DEFAULT_FORCES);
  const [panelOpen, setPanelOpen] = useState(true);
  const [hovered, setHovered] = useState<WikiGraphNode | null>(null);
  const [stats, setStats] = useState({ nodes: 0, links: 0 });
  const onStats = useCallback((s: { nodes: number; links: number }) => setStats(s), []);

  const toggle = (key: keyof Omit<GraphFilters, 'search'>) => (
    <Switch size="small" checked={filters[key]} onChange={(e) => setFilters({ ...filters, [key]: e.target.checked })} />
  );

  if (graph.isLoading) return <Typography>Loading graph…</Typography>;
  if (!graph.data || graph.data.nodes.length === 0) {
    return (
      <EmptyState
        title="The knowledge graph is empty"
        description="Pages appear here as summaries are ingested into the wiki. Start an ingest from the Wiki page."
      />
    );
  }

  return (
    <Paper variant="outlined" sx={{ position: 'relative', height: 'calc(100vh - 112px)', overflow: 'hidden' }}>
      <WikiGraph
        data={graph.data}
        filters={filters}
        forces={forces}
        height="100%"
        onHover={setHovered}
        onStats={onStats}
      />

      {/* Control panel, top-right as in Obsidian. */}
      <Paper elevation={3} sx={{ position: 'absolute', top: 12, right: 12, width: 260, maxHeight: 'calc(100% - 24px)', overflow: 'auto' }}>
        <Stack direction="row" alignItems="center" sx={{ px: 1.5, py: 0.5 }}>
          <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
            Graph
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
            {stats.nodes} nodes · {stats.links} links
          </Typography>
          <IconButton size="small" aria-label="Toggle graph settings" onClick={() => setPanelOpen((o) => !o)}>
            <TuneIcon fontSize="small" />
          </IconButton>
        </Stack>
        <Collapse in={panelOpen}>
          <Divider />
          <Box sx={{ px: 1.5, py: 1 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Search pages…"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Filters
            </Typography>
            <Stack>
              <FormControlLabel control={toggle('showSources')} label={<Typography variant="body2">Sources</Typography>} />
              <FormControlLabel control={toggle('showDaily')} label={<Typography variant="body2">Daily highlights</Typography>} />
              <FormControlLabel control={toggle('showAnswers')} label={<Typography variant="body2">Filed answers</Typography>} />
              <FormControlLabel control={toggle('showOrphans')} label={<Typography variant="body2">Orphans</Typography>} />
              <FormControlLabel control={toggle('showUnresolved')} label={<Typography variant="body2">Unresolved links</Typography>} />
            </Stack>
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Forces
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Repel
            </Typography>
            <Slider
              size="small"
              min={20}
              max={400}
              value={forces.repel}
              onChange={(_, v) => setForces({ ...forces, repel: v as number })}
            />
            <Typography variant="caption" color="text.secondary">
              Link distance
            </Typography>
            <Slider
              size="small"
              min={10}
              max={150}
              value={forces.linkDistance}
              onChange={(_, v) => setForces({ ...forces, linkDistance: v as number })}
            />
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Legend
            </Typography>
            <Stack spacing={0.5}>
              {LEGEND_ORDER.map((t) => (
                <Stack key={t} direction="row" spacing={1} alignItems="center">
                  <LegendSwatch shape={TYPE_STYLE[t].shape} color={TYPE_STYLE[t].color(mode)} />
                  <Typography variant="body2">{TYPE_STYLE[t].label}</Typography>
                </Stack>
              ))}
              {filters.showUnresolved && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <LegendSwatch shape={UNRESOLVED_STYLE.shape} color={UNRESOLVED_STYLE.color(mode)} />
                  <Typography variant="body2">{UNRESOLVED_STYLE.label}</Typography>
                </Stack>
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              Node size = number of links. Hover to highlight neighbours, click to open, scroll to zoom, drag to move.
            </Typography>
          </Box>
        </Collapse>
      </Paper>

      {/* Hover card, bottom-left. */}
      {hovered && (
        <Paper elevation={3} sx={{ position: 'absolute', left: 12, bottom: 12, maxWidth: 420, p: 1.5, pointerEvents: 'none' }}>
          <Typography variant="caption" color="text.secondary">
            {hovered.missing ? UNRESOLVED_STYLE.label : TYPE_STYLE[hovered.type].label} · {hovered.degree} links
          </Typography>
          <Typography variant="subtitle2">{hovered.title}</Typography>
          {hovered.summary && (
            <Typography variant="body2" color="text.secondary">
              {hovered.summary}
            </Typography>
          )}
          {hovered.missing && (
            <Typography variant="body2" color="text.secondary">
              Linked to, but no page exists yet.
            </Typography>
          )}
        </Paper>
      )}

      <Typography
        variant="caption"
        component={Link}
        to="/knowledge/wiki"
        sx={{ position: 'absolute', left: 12, top: 12, color: 'text.secondary' }}
      >
        ← Wiki
      </Typography>
    </Paper>
  );
}
