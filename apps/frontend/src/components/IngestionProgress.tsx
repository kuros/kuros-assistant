import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  Popover,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Tooltip,
  Typography,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { useQueryClient } from '@tanstack/react-query';
import type { IngestPhase, IngestionItemDto, IngestionProgressDto } from '@kuros/shared';
import { useIngestionProgress, useRetryFailedIngestion } from '../api/hooks/knowledge';
import { wikiHref } from './WikiMarkdown';

const ITEM_STEPS: Array<{ phase: IngestPhase; label: string }> = [
  { phase: 'planning', label: 'Plan pages' },
  { phase: 'writing', label: 'Write pages' },
  { phase: 'saving', label: 'Save & index' },
];

const KIND_LABEL: Record<string, string> = { slack: 'Slack', outlook: 'Outlook', 'outlook-personal': 'Outlook', jira: 'Jira' };

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** Re-renders every `ms` while enabled, for live elapsed timers. */
function useNow(enabled: boolean, ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [enabled, ms]);
  return now;
}

function batchPercent(p: IngestionProgressDto): number {
  const b = p.batch;
  if (!b || b.total === 0) return 0;
  return Math.round(((b.completed + b.failed) / b.total) * 100);
}

/** Summaries finished or in the current pass (a day's summaries are ingested together). */
function position(p: IngestionProgressDto): number {
  const b = p.batch;
  if (!b) return 0;
  return Math.min(b.completed + b.failed + (p.current ? p.currentSources : 0), b.total);
}

function itemSubtitle(i: IngestionItemDto): string {
  const kind = i.connectorKind ? KIND_LABEL[i.connectorKind] ?? i.connectorKind : null;
  return [kind, i.periodDate].filter(Boolean).join(' · ');
}

function CurrentItem({ p, now }: { p: IngestionProgressDto; now: number }): JSX.Element | null {
  if (p.phase === 'settling') {
    const left = p.settleUntil ? new Date(p.settleUntil).getTime() - now : null;
    return (
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <HourglassEmptyIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Waiting for more summaries
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Daily highlights are generated once the queue has been quiet for a few minutes
            {left != null ? ` (starts in ${formatDuration(left)})` : ''}.
          </Typography>
        </Box>
      </Stack>
    );
  }
  if (p.phase === 'highlights') {
    return (
      <Stack direction="row" spacing={1} alignItems="center">
        <CircularProgress size={16} />
        <Typography variant="body2">
          Generating highlights for {p.highlightsDates.join(', ')} ·{' '}
          {formatDuration(p.phaseStartedAt ? now - new Date(p.phaseStartedAt).getTime() : null)}
        </Typography>
      </Stack>
    );
  }
  if (!p.current) {
    return (
      <Typography variant="body2" color="text.secondary">
        Starting…
      </Typography>
    );
  }
  const activeStep = Math.max(0, ITEM_STEPS.findIndex((s) => s.phase === p.phase));
  const elapsed = p.current.startedAt ? now - new Date(p.current.startedAt).getTime() : null;
  return (
    <Box>
      <Stack direction="row" alignItems="baseline" spacing={1}>
        <Typography variant="body2" sx={{ fontWeight: 600, flexGrow: 1, minWidth: 0 }} noWrap title={p.current.label}>
          {p.current.label}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {formatDuration(elapsed)}
          {p.avgDayMs ? ` / ~${formatDuration(p.avgDayMs)}` : ''}
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {p.current.periodDate} · {p.currentSources} source{p.currentSources === 1 ? '' : 's'} in one pass
      </Typography>
      <Stepper activeStep={p.phase === 'starting' ? 0 : activeStep} alternativeLabel sx={{ mt: 1.5, '& .MuiStepLabel-label': { fontSize: 12, mt: 0.5 } }}>
        {ITEM_STEPS.map((s) => (
          <Step key={s.phase}>
            <StepLabel>{s.label}</StepLabel>
          </Step>
        ))}
      </Stepper>
    </Box>
  );
}

function ItemRow({ i }: { i: IngestionItemDto }): JSX.Element {
  const failed = i.status === 'failed';
  const body = (
    <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ py: 0.5 }}>
      {failed ? (
        <ErrorOutlineIcon fontSize="small" color="error" sx={{ mt: 0.25 }} />
      ) : (
        <CheckCircleOutlineIcon fontSize="small" color="success" sx={{ mt: 0.25 }} />
      )}
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        {i.sourcePage && !failed ? (
          <Typography variant="body2" component={Link} to={wikiHref(i.sourcePage)} noWrap sx={{ display: 'block', color: 'text.primary', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
            {i.label}
          </Typography>
        ) : (
          <Typography variant="body2" noWrap>
            {i.label}
          </Typography>
        )}
        <Typography variant="caption" color={failed ? 'error' : 'text.secondary'} noWrap sx={{ display: 'block' }}>
          {failed ? `Failed: ${i.error ?? 'unknown error'}` : `${itemSubtitle(i)} · ${i.pagesTouched} pages · ${formatDuration(i.durationMs)}`}
        </Typography>
      </Box>
    </Stack>
  );
  return failed && i.error ? <Tooltip title={i.error}>{body}</Tooltip> : body;
}

/** Full progress readout. `compact` trims the lists for narrow sidebars. */
export function IngestionProgressDetails({ compact = false }: { compact?: boolean }): JSX.Element | null {
  const q = useIngestionProgress();
  const retry = useRetryFailedIngestion();
  const p = q.data;
  const now = useNow(!!p?.active);
  if (!p) return null;

  const pct = batchPercent(p);
  const b = p.batch;
  const recentFailed = p.recent.filter((r) => r.status === 'failed').length;

  return (
    <Box>
      {p.active && b ? (
        <>
          <Stack direction="row" alignItems="baseline" justifyContent="space-between">
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Ingesting {position(p)} of {b.total}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {p.etaMs != null ? `~${formatDuration(p.etaMs)} left` : 'estimating…'}
            </Typography>
          </Stack>
          <LinearProgress variant="determinate" value={pct} sx={{ my: 1, height: 6, borderRadius: 3 }} />
          <Typography variant="caption" color="text.secondary">
            {b.completed} done{b.failed ? ` · ${b.failed} failed` : ''} · {p.queued} queued
            {p.queuedDays ? ` (${p.queuedDays} day${p.queuedDays === 1 ? '' : 's'})` : ''} · started{' '}
            {formatDuration(now - new Date(b.startedAt).getTime())} ago
          </Typography>
          <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
            <CurrentItem p={p} now={now} />
          </Box>
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {b?.finishedAt
            ? `Idle. Last run: ${b.completed} ingested${b.failed ? `, ${b.failed} failed` : ''}, finished ${formatDuration(Date.now() - new Date(b.finishedAt).getTime())} ago.`
            : p.queued > 0
              ? `${p.queued} queued, waiting for the worker to start.`
              : 'Idle. New summaries are ingested automatically.'}
        </Typography>
      )}

      {!compact && p.upNext.length > 0 && (
        <>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            Up next
          </Typography>
          {p.upNext.map((i) => (
            <Typography key={i.id} variant="body2" noWrap color="text.secondary">
              {i.label} <Typography component="span" variant="caption">· {itemSubtitle(i)}</Typography>
            </Typography>
          ))}
          {p.queued > p.upNext.length && (
            <Typography variant="caption" color="text.secondary">
              +{p.queued - p.upNext.length} more
            </Typography>
          )}
        </>
      )}

      {p.recent.length > 0 && (
        <>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            Recently finished
          </Typography>
          {p.recent.slice(0, compact ? 3 : 8).map((i) => (
            <ItemRow key={i.id} i={i} />
          ))}
        </>
      )}

      {recentFailed > 0 && !p.active && (
        <Button size="small" color="warning" sx={{ mt: 1 }} disabled={retry.isPending} onClick={() => retry.mutate()}>
          Retry failed
        </Button>
      )}
    </Box>
  );
}

/**
 * App-bar chip, visible on every page while ingestion runs (and briefly after).
 * Also keeps wiki views fresh: each finished item invalidates wiki queries.
 */
export function IngestionIndicator(): JSX.Element | null {
  const q = useIngestionProgress();
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const p = q.data;
  const finishedCount = p?.batch ? p.batch.completed + p.batch.failed : 0;
  const lastCount = useRef(finishedCount);

  useEffect(() => {
    if (finishedCount !== lastCount.current) {
      lastCount.current = finishedCount;
      void qc.invalidateQueries({ queryKey: ['knowledge'] });
    }
  }, [finishedCount, qc]);

  if (!p) return null;
  const b = p.batch;
  const recentlyFinished = !!b?.finishedAt && Date.now() - new Date(b.finishedAt).getTime() < 10 * 60 * 1000;
  if (!p.active && !recentlyFinished) return null;

  const failed = (b?.failed ?? 0) > 0;
  const label = p.active
    ? p.phase === 'settling'
      ? 'Wiki: waiting'
      : p.phase === 'highlights'
        ? 'Wiki: highlights'
        : `Ingesting ${b ? `${position(p)}/${b.total}` : '…'}`
    : `Wiki updated${failed ? ` · ${b!.failed} failed` : ''}`;

  return (
    <>
      <Chip
        clickable
        onClick={(e) => setAnchor(e.currentTarget)}
        variant="outlined"
        color={!p.active && failed ? 'warning' : 'default'}
        icon={
          p.active ? (
            <Box sx={{ position: 'relative', display: 'inline-flex', ml: '6px !important' }}>
              <CircularProgress variant="determinate" value={100} size={16} thickness={5} sx={{ color: 'action.disabled', position: 'absolute' }} />
              <CircularProgress
                variant={p.phase === 'settling' || p.phase === 'highlights' ? 'indeterminate' : 'determinate'}
                value={batchPercent(p)}
                size={16}
                thickness={5}
              />
            </Box>
          ) : failed ? (
            <ErrorOutlineIcon fontSize="small" />
          ) : (
            <CheckCircleOutlineIcon fontSize="small" color="success" />
          )
        }
        label={<Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>{label}</Box>}
        sx={{ mr: 1 }}
        aria-label="Knowledge base ingestion progress"
      />
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 420, p: 2, mt: 1 } } }}
      >
        <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
            Knowledge base ingestion
          </Typography>
          <Button size="small" component={Link} to="/knowledge/wiki" onClick={() => setAnchor(null)}>
            Open wiki
          </Button>
        </Stack>
        <Divider sx={{ mb: 1.5 }} />
        <IngestionProgressDetails />
      </Popover>
    </>
  );
}
