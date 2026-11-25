import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControlLabel,
  LinearProgress,
  List,
  ListItemButton,
  ListItemText,
  ListSubheader,
  Paper,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined';
import ReplayIcon from '@mui/icons-material/Replay';
import { format, subDays } from 'date-fns';
import type { WikiPageMeta, WikiPageType } from '@kuros/shared';
import {
  useBackfillWiki,
  useRetryFailedIngestion,
  useWikiGraph,
  useWikiPage,
  useWikiPages,
  useWikiSpecial,
  useWikiStatus,
} from '../api/hooks/knowledge';
import { WikiMarkdown, wikiHref } from '../components/WikiMarkdown';
import { EmptyState } from '../components/EmptyState';
import { IngestionProgressDetails } from '../components/IngestionProgress';
import { DEFAULT_FILTERS, WikiGraph } from '../components/WikiGraph';

const GROUPS: Array<{ type: WikiPageType; label: string; newestFirst?: boolean; limit?: number }> = [
  { type: 'daily', label: 'Daily highlights', newestFirst: true, limit: 14 },
  { type: 'person', label: 'People' },
  { type: 'team', label: 'Teams' },
  { type: 'project', label: 'Projects' },
  { type: 'topic', label: 'Topics' },
  { type: 'answer', label: 'Filed answers', newestFirst: true },
  { type: 'source', label: 'Sources', newestFirst: true, limit: 40 },
];

const TYPE_LABEL: Record<WikiPageType, string> = {
  source: 'Source',
  person: 'Person',
  team: 'Team',
  project: 'Project',
  topic: 'Topic',
  daily: 'Daily',
  answer: 'Answer',
};

function StatusPanel(): JSX.Element {
  const status = useWikiStatus({ poll: true });
  const backfill = useBackfillWiki();
  const retry = useRetryFailedIngestion();
  const s = status.data;
  if (!s) return <LinearProgress />;
  return (
    <Card variant="outlined">
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <Typography variant="subtitle2">Knowledge base</Typography>
        <Typography variant="body2" color="text.secondary">
          {s.pageCount} page{s.pageCount === 1 ? '' : 's'} · {s.counts.done} source{s.counts.done === 1 ? '' : 's'} ingested
        </Typography>
        <Box sx={{ mt: 1.5 }}>
          <IngestionProgressDetails compact />
        </Box>
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
          {s.notQueued > 0 && (
            <>
              <Tooltip title="Queue summaries from the last 14 days that are not in the wiki yet">
                <span>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<CloudDownloadOutlinedIcon />}
                    disabled={backfill.isPending}
                    onClick={() => backfill.mutate({ from: format(subDays(new Date(), 13), 'yyyy-MM-dd') })}
                  >
                    Ingest last 14 days
                  </Button>
                </span>
              </Tooltip>
              <Button
                size="small"
                disabled={backfill.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Queue all ${s.notQueued} summaries for ingestion? Each takes roughly 1–2 minutes and two LLM calls with your configured AI provider, so this runs in the background for a long time.`,
                    )
                  ) {
                    backfill.mutate({});
                  }
                }}
              >
                Ingest all ({s.notQueued})
              </Button>
            </>
          )}
          {backfill.data && (
            <Typography variant="caption" color="text.secondary" sx={{ width: '100%' }}>
              Queued {backfill.data.queued} summaries.
            </Typography>
          )}
          {s.counts.failed > 0 && (
            <Button size="small" color="warning" startIcon={<ReplayIcon />} disabled={retry.isPending} onClick={() => retry.mutate()}>
              Retry {s.counts.failed} failed
            </Button>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function PageList({ pages, currentPath }: { pages: WikiPageMeta[]; currentPath: string | null }): JSX.Element {
  const [filter, setFilter] = useState('');
  const groups = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const matches = f
      ? pages.filter((p) => `${p.title} ${p.summary} ${p.tags.join(' ')} ${p.path}`.toLowerCase().includes(f))
      : pages;
    return GROUPS.map((g) => {
      const items = matches
        .filter((p) => p.type === g.type)
        .sort((a, b) => (g.newestFirst ? b.path.localeCompare(a.path) : a.title.localeCompare(b.title)));
      return { ...g, total: items.length, items: f ? items : items.slice(0, g.limit ?? items.length) };
    }).filter((g) => g.items.length > 0);
  }, [pages, filter]);

  return (
    <>
      <TextField size="small" fullWidth placeholder="Filter pages…" value={filter} onChange={(e) => setFilter(e.target.value)} sx={{ my: 1.5 }} />
      {groups.map((g) => (
        <List
          key={g.type}
          dense
          disablePadding
          subheader={
            <ListSubheader disableSticky sx={{ bgcolor: 'transparent', lineHeight: '28px', px: 1 }}>
              {g.label} ({g.total})
            </ListSubheader>
          }
        >
          {g.items.map((p) => (
            <ListItemButton key={p.path} component={Link} to={wikiHref(p.path)} selected={p.path === currentPath} sx={{ borderRadius: 1, py: 0.25 }}>
              <ListItemText
                primary={p.title}
                primaryTypographyProps={{ noWrap: true, variant: 'body2' }}
                secondary={g.type === 'source' ? p.path.split('/')[2] : undefined}
              />
            </ListItemButton>
          ))}
        </List>
      ))}
    </>
  );
}

function LocalGraph({ path }: { path: string }): JSX.Element | null {
  const graph = useWikiGraph();
  const [depth, setDepth] = useState(1);
  const [showSources, setShowSources] = useState(true);
  const filters = useMemo(() => ({ ...DEFAULT_FILTERS, showSources }), [showSources]);
  if (!graph.data) return null;
  return (
    <Box sx={{ mt: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
          Local graph
        </Typography>
        <FormControlLabel
          control={<Switch size="small" checked={showSources} onChange={(e) => setShowSources(e.target.checked)} />}
          label={<Typography variant="caption">Sources</Typography>}
        />
        <ToggleButtonGroup size="small" exclusive value={depth} onChange={(_, v) => v && setDepth(v)}>
          <ToggleButton value={1}>1 hop</ToggleButton>
          <ToggleButton value={2}>2 hops</ToggleButton>
        </ToggleButtonGroup>
        <Button size="small" component={Link} to="/knowledge/graph">
          Full graph
        </Button>
      </Stack>
      <Paper variant="outlined" sx={{ bgcolor: 'background.default' }}>
        <WikiGraph data={graph.data} focus={path} depth={depth} filters={filters} height={340} />
      </Paper>
    </Box>
  );
}

function PageView({ path }: { path: string }): JSX.Element {
  const q = useWikiPage(path);
  if (q.isLoading) return <LinearProgress />;
  if (q.isError || !q.data) return <EmptyState title="Page not found" description={path} />;
  const p = q.data;
  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
        <Chip size="small" label={TYPE_LABEL[p.type]} color="primary" variant="outlined" />
        {p.tags.map((t) => (
          <Chip key={t} size="small" label={t} />
        ))}
        <Box sx={{ flexGrow: 1 }} />
        {p.updated && (
          <Typography variant="caption" color="text.secondary">
            Updated {format(new Date(p.updated), 'PPp')}
          </Typography>
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
        {p.path}.md
      </Typography>
      <Divider sx={{ my: 2 }} />
      <WikiMarkdown markdown={p.body} />
      {(p.backlinks.length > 0 || p.sources.length > 0) && <Divider sx={{ my: 3 }} />}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={4}>
        {p.backlinks.length > 0 && (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Linked from ({p.backlinks.length})
            </Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {p.backlinks.map((b) => (
                <Chip key={b} size="small" variant="outlined" component={Link} to={wikiHref(b)} clickable label={b} />
              ))}
            </Stack>
          </Box>
        )}
        {p.sources.length > 0 && (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {p.type === 'source' ? 'Raw summary' : `Sources (${p.sources.length})`}
            </Typography>
            <Stack spacing={0.25}>
              {p.sources.slice(0, 30).map((s) =>
                !s.startsWith('users/') ? (
                  <Typography key={s} variant="body2" component={Link} to={wikiHref(s)} sx={{ color: 'primary.main', textDecoration: 'none' }}>
                    {s}
                  </Typography>
                ) : (
                  <Typography key={s} variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    {s}
                  </Typography>
                ),
              )}
            </Stack>
          </Box>
        )}
      </Stack>
      <LocalGraph path={p.path} />
    </Box>
  );
}

function SpecialView(): JSX.Element {
  const [tab, setTab] = useState<'index' | 'log' | 'schema'>('index');
  const q = useWikiSpecial(tab);
  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab value="index" label="Index" />
        <Tab value="log" label="Log" />
        <Tab value="schema" label="Schema" />
      </Tabs>
      {q.isLoading ? <LinearProgress /> : <WikiMarkdown markdown={q.data?.content ?? ''} />}
    </Box>
  );
}

export function WikiPage(): JSX.Element {
  const params = useParams();
  const currentPath = params['*'] ? params['*'].replace(/\/+$/, '') : null;
  const pages = useWikiPages();

  return (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
      <Box sx={{ width: 280, flexShrink: 0, position: 'sticky', top: 88, maxHeight: 'calc(100vh - 112px)', overflow: 'auto' }}>
        <StatusPanel />
        {pages.data && pages.data.length > 0 && (
          <Button component={Link} to="/knowledge/wiki" size="small" sx={{ mt: 1 }}>
            Index · Log · Schema
          </Button>
        )}
        {pages.data && <PageList pages={pages.data} currentPath={currentPath} />}
      </Box>
      <Paper variant="outlined" sx={{ flexGrow: 1, p: 3, minWidth: 0 }}>
        {currentPath ? <PageView path={currentPath} /> : <SpecialView />}
      </Paper>
    </Box>
  );
}
