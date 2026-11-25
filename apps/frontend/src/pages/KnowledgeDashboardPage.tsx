import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import QuestionAnswerOutlinedIcon from '@mui/icons-material/QuestionAnswerOutlined';
import { addDays, format, parseISO } from 'date-fns';
import type { DailyHighlight, DailyHighlightsDto } from '@kuros/shared';
import { useDailyHighlights, useGenerateHighlights } from '../api/hooks/knowledge';
import { EmptyState } from '../components/EmptyState';
import { WikiMarkdown, wikiHref } from '../components/WikiMarkdown';

const IMPORTANCE_COLOR: Record<DailyHighlight['importance'], 'error' | 'warning' | 'default'> = {
  high: 'error',
  medium: 'warning',
  low: 'default',
};

const CATEGORY_LABEL: Record<DailyHighlight['category'], string> = {
  decision: 'Decision',
  progress: 'Progress',
  blocker: 'Blocker',
  people: 'People',
  announcement: 'Announcement',
  request: 'Request',
  other: 'Other',
};

function pageLabel(path: string): string {
  return (path.split('/').pop() ?? path).replace(/-[0-9a-f]{6}$/, '').replace(/-/g, ' ');
}

function StatTile({ label, value, tone }: { label: string; value: number | string; tone?: 'error' }): JSX.Element {
  return (
    <Card variant="outlined" sx={{ flex: '1 1 140px' }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 600 }} color={tone === 'error' ? 'error.main' : 'text.primary'}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

function SideCard({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          {title}
        </Typography>
        {children}
      </CardContent>
    </Card>
  );
}

function HighlightCard({ h }: { h: DailyHighlight }): JSX.Element {
  return (
    <Card variant="outlined">
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }} flexWrap="wrap" useFlexGap>
          <Chip size="small" label={h.importance} color={IMPORTANCE_COLOR[h.importance]} variant="outlined" />
          <Chip size="small" label={CATEGORY_LABEL[h.category]} />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {h.title}
          </Typography>
        </Stack>
        <WikiMarkdown markdown={h.detail} dense />
        {h.links.length > 0 && (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
            {h.links.map((l) => (
              <Chip
                key={l}
                size="small"
                variant="outlined"
                component={Link}
                to={wikiHref(l)}
                clickable
                label={pageLabel(l)}
              />
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

function Highlights({ data }: { data: DailyHighlightsDto }): JSX.Element {
  const riskTotal = Object.values(data.stats.risks).reduce((a, b) => a + b, 0);
  const severe = data.stats.risks.high + data.stats.risks.critical;
  return (
    <>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 3 }}>
        <StatTile label="Sources" value={data.stats.sources} />
        <StatTile label="Items processed" value={data.stats.items} />
        <StatTile label="Wiki pages updated" value={data.stats.pagesTouched} />
        <StatTile label="Action items" value={data.stats.actionItems} />
        <StatTile label={severe ? `Risks (${severe} high+)` : 'Risks'} value={riskTotal} tone={severe ? 'error' : undefined} />
      </Stack>

      {data.headline && (
        <Card variant="outlined" sx={{ mb: 3, borderLeft: 4, borderLeftColor: 'primary.main' }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              The day in one line
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 500 }}>
              {data.headline}
            </Typography>
          </CardContent>
        </Card>
      )}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 2fr) minmax(0, 1fr)' } }}>
        <Stack spacing={1.5}>
          {data.highlights.map((h, i) => (
            <HighlightCard key={i} h={h} />
          ))}
        </Stack>
        <Stack spacing={2}>
          {data.followUps.length > 0 && (
            <SideCard title="Follow up tomorrow">
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {data.followUps.map((f, i) => (
                  <Typography component="li" variant="body2" key={i} sx={{ mb: 0.5 }}>
                    {f}
                  </Typography>
                ))}
              </Box>
            </SideCard>
          )}
          {data.people.length > 0 && (
            <SideCard title="People in focus">
              <Stack spacing={1}>
                {data.people.map((p, i) => (
                  <Box key={i}>
                    {p.page ? (
                      <Typography variant="body2" component={Link} to={wikiHref(p.page)} sx={{ fontWeight: 600, color: 'primary.main', textDecoration: 'none' }}>
                        {p.name}
                      </Typography>
                    ) : (
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {p.name}
                      </Typography>
                    )}
                    <Typography variant="body2" color="text.secondary">
                      {p.note}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </SideCard>
          )}
          {data.themes.length > 0 && (
            <SideCard title="Themes">
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {data.themes.map((t) => (
                  <Chip key={t} size="small" label={t} />
                ))}
              </Stack>
            </SideCard>
          )}
          {data.sourcePages.length > 0 && (
            <SideCard title={`Sources (${data.sourcePages.length})`}>
              <Stack spacing={1}>
                {data.sourcePages.map((s) => (
                  <Box key={s.path}>
                    <Typography variant="body2" component={Link} to={wikiHref(s.path)} sx={{ color: 'primary.main', textDecoration: 'none' }}>
                      {s.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {s.summary}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </SideCard>
          )}
        </Stack>
      </Box>
    </>
  );
}

export function KnowledgeDashboardPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const date = searchParams.get('date') ?? format(new Date(), 'yyyy-MM-dd');
  const setDate = (next: string) => setSearchParams({ date: next });
  const q = useDailyHighlights(date);
  const generate = useGenerateHighlights();
  const data = q.data;
  const hasHighlights = !!data?.headline;
  const canGenerate = (data?.sourcePages.length ?? 0) > 0;

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }} flexWrap="wrap" useFlexGap spacing={2}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography variant="h5">Highlights</Typography>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <IconButton size="small" aria-label="Previous day" onClick={() => setDate(format(addDays(parseISO(date), -1), 'yyyy-MM-dd'))}>
              <ChevronLeftIcon />
            </IconButton>
            <TextField type="date" size="small" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            <IconButton size="small" aria-label="Next day" onClick={() => setDate(format(addDays(parseISO(date), 1), 'yyyy-MM-dd'))}>
              <ChevronRightIcon />
            </IconButton>
          </Stack>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<QuestionAnswerOutlinedIcon />}
            onClick={() => navigate(`/knowledge/ask?q=${encodeURIComponent(`What were the most important things that happened on ${date}?`)}`)}
          >
            Ask about this day
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={<AutoAwesomeIcon />}
            disabled={!canGenerate || generate.isPending}
            onClick={() => generate.mutate(date)}
          >
            {generate.isPending ? 'Generating…' : hasHighlights ? 'Regenerate' : 'Generate highlights'}
          </Button>
        </Stack>
      </Stack>

      {generate.isPending && <LinearProgress sx={{ mb: 2 }} />}
      {generate.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(generate.error as Error).message}
        </Alert>
      )}
      {q.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(q.error as Error).message}
        </Alert>
      )}
      {data && data.stats.pendingIngestion > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {data.stats.pendingIngestion} source{data.stats.pendingIngestion === 1 ? '' : 's'} for this day{' '}
          {data.stats.pendingIngestion === 1 ? 'is' : 'are'} still being ingested into the knowledge base. Highlights
          refresh automatically when ingestion finishes. Summaries that have never been queued can be added from the{' '}
          <Link to="/knowledge/wiki">Wiki</Link> page (Ingest all).
        </Alert>
      )}
      {data?.stale && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => generate.mutate(date)} disabled={generate.isPending}>
              Regenerate
            </Button>
          }
        >
          New sources were ingested after these highlights were generated.
        </Alert>
      )}

      {q.isLoading && <Typography>Loading…</Typography>}
      {data && !hasHighlights && (
        <EmptyState
          title={canGenerate ? 'No highlights generated yet' : 'Nothing in the knowledge base for this day'}
          description={
            canGenerate
              ? 'Click "Generate highlights" to synthesise the day from its ingested sources.'
              : 'Highlights are built from daily summaries once they are ingested into the wiki. Generate summaries on the Daily summary page first.'
          }
        />
      )}
      {data && hasHighlights && <Highlights data={data} />}
      {data?.generatedAt && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
          Generated {format(new Date(data.generatedAt), 'PPpp')} ·{' '}
          <Link to={wikiHref(`daily/${date}`)}>open as wiki page</Link>
        </Typography>
      )}
    </Box>
  );
}
