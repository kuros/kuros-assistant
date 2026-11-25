import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  LinearProgress,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import type { MissingSummaryItem, SummaryBackfillJobDto } from '@kuros/shared';
import {
  useCancelSummaryBackfill,
  useMissingSummaries,
  useStartSummaryBackfill,
  useSummaryBackfill,
} from '../api/hooks/summaries';
import { formatDuration } from './IngestionProgress';

const PRESETS = [1, 3, 7, 14, 30];
const MAX_DAYS = 60;
const DEFAULT_DAYS = 7;

const plural = (n: number, word: string, many = `${word}s`) => `${n.toLocaleString()} ${n === 1 ? word : many}`;
const isActive = (job: SummaryBackfillJobDto | null | undefined) =>
  job?.status === 'running' || job?.status === 'cancelling';
const prettyDate = (d: string) => format(parseISO(d), 'EEE d MMM');

function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

function Picker({ onStarted }: { onStarted: () => void }): JSX.Element {
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [custom, setCustom] = useState('');
  // Connectors the user unticked (e.g. Jira, whose days are large). Empty = all included.
  const [excluded, setExcluded] = useState<string[]>([]);
  const allConnectors = useMissingSummaries(days, true).data?.connectors ?? [];
  const included = allConnectors.map((c) => c.connectorId).filter((id) => !excluded.includes(id));
  const narrowed = excluded.length > 0 ? included : undefined;
  const preview = useMissingSummaries(days, !narrowed || included.length > 0, narrowed);
  const start = useStartSummaryBackfill();
  const data = narrowed && included.length === 0 ? undefined : preview.data;

  const byDate = useMemo(() => {
    const m = new Map<string, MissingSummaryItem[]>();
    for (const i of data?.items ?? []) m.set(i.date, [...(m.get(i.date) ?? []), i]);
    return [...m.entries()].reverse(); // newest first for reading
  }, [data]);

  return (
    <>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Generates daily summaries for past days that have synced data but no summary, for example days the app
          wasn't running at the nightly run. Pick how far back to look; nothing runs until you press Start.
        </Typography>
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="body2">Look back</Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={PRESETS.includes(days) && !custom ? days : null}
            onChange={(_, v: number | null) => {
              if (v) {
                setDays(v);
                setCustom('');
              }
            }}
          >
            {PRESETS.map((p) => (
              <ToggleButton key={p} value={p}>
                {p === 1 ? 'Yesterday' : `${p} days`}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <TextField
            size="small"
            type="number"
            label="Custom"
            placeholder={`1–${MAX_DAYS}`}
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= 1 && n <= MAX_DAYS) setDays(n);
            }}
            inputProps={{ min: 1, max: MAX_DAYS }}
            sx={{ width: 110 }}
          />
        </Stack>

        {allConnectors.length > 1 && (
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
            <Typography variant="body2">Include</Typography>
            {allConnectors.map((c) => (
              <FormControlLabel
                key={c.connectorId}
                control={
                  <Checkbox
                    size="small"
                    checked={!excluded.includes(c.connectorId)}
                    onChange={(e) =>
                      setExcluded((prev) =>
                        e.target.checked ? prev.filter((id) => id !== c.connectorId) : [...prev, c.connectorId],
                      )
                    }
                  />
                }
                label={
                  <Typography variant="body2">
                    {c.connectorName}{' '}
                    <Typography component="span" variant="caption" color="text.secondary">
                      ({plural(c.summaries, 'day')}, {plural(c.rawItems, 'item')})
                    </Typography>
                  </Typography>
                }
              />
            ))}
          </Stack>
        )}

        <Box sx={{ mt: 2.5, minHeight: 160 }}>
          {preview.isFetching && <LinearProgress sx={{ mb: 2 }} />}
          {preview.isError && <Alert severity="error">{(preview.error as Error).message}</Alert>}
          {data && (
            <>
              <Alert severity={data.items.length ? 'info' : 'success'} sx={{ mb: 2 }}>
                {data.items.length ? (
                  <>
                    <strong>
                      {plural(data.items.length, 'summary', 'summaries')} across{' '}
                      {plural(data.missingDays, 'day')}
                    </strong>{' '}
                    ({data.from === data.to ? prettyDate(data.from) : `${prettyDate(data.from)} – ${prettyDate(data.to)}`}), {plural(data.totalRawItems, 'item')} to read.
                    About <strong>{data.estimatedLlmCalls.toLocaleString()} LLM calls</strong> with your AI settings,
                    including wiki ingestion and daily highlights.
                  </>
                ) : (
                  <>
                    Nothing missing between {prettyDate(data.from)} and {prettyDate(data.to)}.
                  </>
                )}
              </Alert>
              <Stack spacing={1} sx={{ maxHeight: 280, overflow: 'auto' }}>
                {byDate.map(([date, items]) => (
                  <Box key={date}>
                    <Typography variant="caption" color="text.secondary">
                      {prettyDate(date)} · {plural(items.reduce((n, i) => n + i.rawItems, 0), 'item')}
                    </Typography>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.25 }}>
                      {items.map((i) => (
                        <Tooltip key={i.connectorId} title={i.sources.join(', ')}>
                          <Chip
                            size="small"
                            variant="outlined"
                            label={`${i.connectorName}${i.sources.length > 1 ? ` (${i.sources.length} channels)` : ''} · ${i.rawItems}`}
                          />
                        </Tooltip>
                      ))}
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </>
          )}
        </Box>
        {start.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {(start.error as Error).message}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          variant="contained"
          disabled={!data?.items.length || preview.isFetching || start.isPending}
          onClick={() => start.mutate({ days, connectorIds: narrowed }, { onSuccess: onStarted })}
        >
          {data?.items.length ? `Start: ${plural(data.items.length, 'summary', 'summaries')}` : 'Start'}
        </Button>
      </DialogActions>
    </>
  );
}

function JobView({ job, onNew }: { job: SummaryBackfillJobDto; onNew: () => void }): JSX.Element {
  const cancel = useCancelSummaryBackfill();
  const active = isActive(job);
  const now = useNow(active);
  const finished = job.completed + job.failed;
  const pct = job.total ? Math.round((finished / job.total) * 100) : 0;
  const avg = useMemo(() => {
    const ok = job.results.filter((r) => r.ok);
    return ok.length ? ok.reduce((n, r) => n + r.durationMs, 0) / ok.length : null;
  }, [job.results]);
  const elapsed = job.currentStartedAt ? now - new Date(job.currentStartedAt).getTime() : null;
  const eta = active && avg ? (job.total - finished) * avg - Math.min(elapsed ?? 0, avg) : null;

  return (
    <>
      <DialogContent>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline">
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {active
              ? `Summarizing ${Math.min(finished + 1, job.total)} of ${job.total}`
              : job.status === 'done'
                ? `Finished: ${job.completed} of ${job.total} summarized`
                : job.status === 'cancelled'
                  ? `Cancelled after ${finished} of ${job.total}`
                  : `Stopped after ${finished} of ${job.total}`}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {active ? (eta != null ? `~${formatDuration(eta)} left` : 'estimating…') : ''}
          </Typography>
        </Stack>
        <LinearProgress variant="determinate" value={pct} sx={{ my: 1, height: 6, borderRadius: 3 }} />
        <Typography variant="caption" color="text.secondary">
          {prettyDate(job.from)} – {prettyDate(job.to)} · {job.completed} done
          {job.failed ? ` · ${job.failed} failed` : ''} · started {formatDuration(now - new Date(job.startedAt).getTime())} ago
        </Typography>

        {job.current && (
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1.5, p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
            <CircularProgress size={18} />
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                {job.current.connectorName} · {prettyDate(job.current.date)}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }} title={job.current.sources.join(', ')}>
                {plural(job.current.rawItems, 'item')} from {job.current.sources.join(', ')}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatDuration(elapsed)}
            </Typography>
          </Stack>
        )}
        {job.status === 'cancelling' && (
          <Alert severity="info" sx={{ mt: 1.5 }}>
            Cancelling: the current summary finishes, nothing new starts.
          </Alert>
        )}
        {job.error && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {job.error}
          </Alert>
        )}
        {active && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            Each new summary is also queued for the knowledge base; that progress shows in the "Ingesting" chip.
          </Typography>
        )}

        {job.results.length > 0 && (
          <>
            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              Recent
            </Typography>
            {job.results.slice(0, 8).map((r, idx) => {
              const row = (
                <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ py: 0.4 }}>
                  {r.ok ? (
                    <CheckCircleOutlineIcon fontSize="small" color="success" sx={{ mt: 0.2 }} />
                  ) : (
                    <ErrorOutlineIcon fontSize="small" color="error" sx={{ mt: 0.2 }} />
                  )}
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" noWrap>
                      {r.item.connectorName} · {prettyDate(r.item.date)}
                    </Typography>
                    <Typography variant="caption" color={r.ok ? 'text.secondary' : 'error'} noWrap sx={{ display: 'block' }}>
                      {r.ok ? `${plural(r.item.rawItems, 'item')} · ${formatDuration(r.durationMs)}` : r.error}
                    </Typography>
                  </Box>
                </Stack>
              );
              return r.error ? (
                <Tooltip key={idx} title={r.error}>
                  {row}
                </Tooltip>
              ) : (
                <Box key={idx}>{row}</Box>
              );
            })}
          </>
        )}
      </DialogContent>
      <DialogActions>
        {active ? (
          <Button color="warning" disabled={job.status === 'cancelling' || cancel.isPending} onClick={() => cancel.mutate()}>
            Cancel
          </Button>
        ) : (
          <Button onClick={onNew}>New backfill</Button>
        )}
      </DialogActions>
    </>
  );
}

/** The body mounts on each open (MUI unmounts closed dialogs), so its initial view resets every time. */
function DialogBody({ initialView }: { initialView: 'job' | 'picker' }): JSX.Element {
  const job = useSummaryBackfill().data;
  const [view, setView] = useState<'job' | 'picker'>(() =>
    job && (initialView === 'job' || isActive(job)) ? 'job' : 'picker',
  );
  return job && view === 'job' ? (
    <JobView job={job} onNew={() => setView('picker')} />
  ) : (
    <Picker onStarted={() => setView('job')} />
  );
}

/**
 * `initialView`: the chip opens on the job; the Daily page opens on the picker unless a job
 * is still running (only one runs at a time).
 */
export function SummaryBackfillDialog({
  open,
  onClose,
  initialView = 'picker',
}: {
  open: boolean;
  onClose: () => void;
  initialView?: 'job' | 'picker';
}): JSX.Element {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Summarize missing days</DialogTitle>
      <DialogBody initialView={initialView} />
    </Dialog>
  );
}

/** App-bar chip while a backfill runs (and for 10 minutes after). Refreshes summary views as it goes. */
export function SummaryBackfillIndicator(): JSX.Element | null {
  const job = useSummaryBackfill().data;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const finished = job ? job.completed + job.failed : 0;
  const last = useRef(finished);

  useEffect(() => {
    if (finished !== last.current) {
      last.current = finished;
      void qc.invalidateQueries({ queryKey: ['summaries'] });
    }
  }, [finished, qc]);

  if (!job) return null;
  const active = isActive(job);
  const recent = !!job.finishedAt && Date.now() - new Date(job.finishedAt).getTime() < 10 * 60 * 1000;
  if (!active && !recent) return null;
  const pct = job.total ? Math.round((finished / job.total) * 100) : 0;
  const problem = job.failed > 0 || job.status === 'failed';

  return (
    <>
      <Chip
        clickable
        variant="outlined"
        onClick={() => setOpen(true)}
        color={!active && problem ? 'warning' : 'default'}
        icon={
          active ? (
            <CircularProgress variant="determinate" value={Math.max(pct, 4)} size={16} thickness={5} sx={{ ml: '6px !important' }} />
          ) : problem ? (
            <ErrorOutlineIcon fontSize="small" />
          ) : (
            <CheckCircleOutlineIcon fontSize="small" color="success" />
          )
        }
        label={
          <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {active ? `Summarizing ${Math.min(finished + 1, job.total)}/${job.total}` : `Summaries ${job.status === 'done' ? 'done' : job.status}`}
          </Box>
        }
        sx={{ mr: 1 }}
        aria-label="Missing-day summary progress"
      />
      <SummaryBackfillDialog open={open} onClose={() => setOpen(false)} initialView="job" />
    </>
  );
}
