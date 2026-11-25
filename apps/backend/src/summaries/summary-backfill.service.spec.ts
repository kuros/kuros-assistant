import { addDays, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

// These modules pull @kuros/shared at runtime, which Jest resolves to stale compiled ESM files
// committed under packages/shared/src; the service only needs them as DI tokens.
jest.mock('../connectors/connector-scheduler.service', () => ({ ConnectorSchedulerService: class {} }));
jest.mock('../connectors/connector.registry', () => ({ ConnectorRegistry: class {} }));

import { SummaryBackfillService } from './summary-backfill.service';

const USER = 'u1';
const ymd = (offset: number) => format(addDays(toZonedTime(new Date(), 'UTC'), offset), 'yyyy-MM-dd');
const line = (id: string) => JSON.stringify({ id, text: 'x', timestamp: new Date().toISOString() });
const rawPath = (kind: string, target: string, date: string) => `users/${USER}/${kind}/raw/${target}/${date}.jsonl`;

interface Conn {
  id: string;
  kind: string;
  name: string;
  targets: string[];
  summarised?: string[];
}

function build(opts: { raw: Record<string, string>; connectors: Conn[] }) {
  const storage = {
    exists: jest.fn(async (p: string) => p in opts.raw),
    read: jest.fn(async (p: string) => opts.raw[p]),
  };
  const byKind = new Map(opts.connectors.map((c) => [c.kind, c]));
  const registry = {
    get: (kind: string) => ({
      listTargets: jest.fn(async () => byKind.get(kind)!.targets),
      labelForTarget: jest.fn(async (_c: string, t: string) => `#${t.toLowerCase()}`),
    }),
  };
  const scheduler = {
    generateDailySummaryFor: jest.fn(async (a: { connectorId: string; date: string; emit?: boolean }) => ({
      summary: { id: `${a.connectorId}:${a.date}` },
      sourceLabel: a.connectorId,
    })),
    emitSummaries: jest.fn(),
  };
  const summaries = {
    find: jest.fn(async ({ where }: { where: { connectorId: string } }) =>
      (opts.connectors.find((c) => c.id === where.connectorId)?.summarised ?? []).map((periodStart) => ({ periodStart })),
    ),
  };
  const svc = new SummaryBackfillService(
    registry as never,
    scheduler as never,
    storage as never,
    { find: jest.fn(async () => opts.connectors) } as never,
    summaries as never,
    { findOne: jest.fn(async () => ({ timezone: 'UTC' })) } as never,
  );
  return { svc, scheduler };
}

async function settle(svc: SummaryBackfillService, status: string) {
  for (let i = 0; i < 100 && svc.status(USER)?.status === status; i++) await new Promise((r) => setTimeout(r, 10));
}

describe('SummaryBackfillService.findMissing', () => {
  it('finds connector-days with data but no summary, combining channels, excluding today', async () => {
    const slack: Conn = { id: 'slack', kind: 'slack', name: 'Slack', targets: ['C1', 'C2', 'C1'], summarised: [ymd(-2)] };
    const { svc } = build({
      connectors: [slack],
      raw: {
        [rawPath('slack', 'C1', ymd(-1))]: [line('a'), line('a'), line('b')].join('\n') + '\n', // dup → 2 items
        [rawPath('slack', 'C2', ymd(-1))]: line('c') + '\n',
        [rawPath('slack', 'C2', ymd(-2))]: line('d') + '\n', // day already summarised (old per-channel rows count)
        [rawPath('slack', 'C2', ymd(-3))]: line('e') + '\n',
        [rawPath('slack', 'C1', ymd(-4))]: '\n', // empty → skipped
        [rawPath('slack', 'C1', ymd(0))]: line('f') + '\n', // today → outside window
        [rawPath('slack', 'C1', ymd(-10))]: line('g') + '\n', // outside a 5-day window
      },
    });

    const res = await svc.findMissing(USER, 5);

    expect(res.from).toBe(ymd(-5));
    expect(res.to).toBe(ymd(-1));
    expect(res.items.map((i) => [i.date, i.connectorId, i.sources, i.rawItems])).toEqual([
      [ymd(-3), 'slack', ['#c2'], 1],
      [ymd(-1), 'slack', ['#c1', '#c2'], 3], // C1 listed twice in config → counted once
    ]);
    expect(res.missingDays).toBe(2);
    expect(res.totalRawItems).toBe(4);
    // 2 summaries × (summarise + extraction) + 2 days × (wiki plan + write + highlights)
    expect(res.estimatedLlmCalls).toBe(2 * 2 + 2 * 3);
  });

  it('can be narrowed to some connectors, while still reporting totals for all', async () => {
    const { svc } = build({
      connectors: [
        { id: 'slack', kind: 'slack', name: 'Slack', targets: ['C1'] },
        { id: 'jira', kind: 'jira', name: 'Jira', targets: ['DO'] },
      ],
      raw: {
        [rawPath('slack', 'C1', ymd(-1))]: line('a') + '\n',
        [rawPath('jira', 'DO', ymd(-1))]: [line('1'), line('2'), line('3')].join('\n') + '\n',
      },
    });
    const res = await svc.findMissing(USER, 1, ['slack']);
    expect(res.items.map((i) => i.connectorId)).toEqual(['slack']);
    expect(res.includedConnectorIds).toEqual(['slack']);
    expect(res.connectors.find((c) => c.connectorId === 'jira')).toMatchObject({ summaries: 1, rawItems: 3 });
    expect(res.totalRawItems).toBe(1);
  });

  it('rejects windows outside 1..60 days', async () => {
    const { svc } = build({ raw: {}, connectors: [] });
    await expect(svc.findMissing(USER, 0)).rejects.toThrow('between 1 and 60');
    await expect(svc.findMissing(USER, 61)).rejects.toThrow('between 1 and 60');
  });
});

describe('SummaryBackfillService run', () => {
  const twoConnectorsTwoDays = () =>
    build({
      connectors: [
        { id: 'slack', kind: 'slack', name: 'Slack', targets: ['C1'] },
        { id: 'jira', kind: 'jira', name: 'Jira', targets: ['DO'] },
      ],
      raw: {
        [rawPath('slack', 'C1', ymd(-1))]: line('a') + '\n',
        [rawPath('slack', 'C1', ymd(-2))]: line('a') + '\n',
        [rawPath('jira', 'DO', ymd(-1))]: line('1') + '\n',
        [rawPath('jira', 'DO', ymd(-2))]: line('1') + '\n',
      },
    });

  it('refuses to start when nothing is missing', async () => {
    const { svc, scheduler } = build({ raw: {}, connectors: [] });
    await expect(svc.start(USER, 7)).rejects.toThrow('No missing daily summaries');
    expect(scheduler.generateDailySummaryFor).not.toHaveBeenCalled();
  });

  it('runs oldest day first and hands each day to the wiki as one batch', async () => {
    const { svc, scheduler } = twoConnectorsTwoDays();
    await svc.start(USER, 3);
    await settle(svc, 'running');

    expect(svc.status(USER)).toMatchObject({ status: 'done', total: 4, completed: 4, failed: 0 });
    expect(scheduler.generateDailySummaryFor.mock.calls.map((c) => [c[0].date, c[0].connectorId, c[0].emit])).toEqual([
      [ymd(-2), 'jira', false],
      [ymd(-2), 'slack', false],
      [ymd(-1), 'jira', false],
      [ymd(-1), 'slack', false],
    ]);
    const batches = scheduler.emitSummaries.mock.calls
      .map((c) => (c[1] as Array<{ summary: { id: string } }>).map((x) => x.summary.id))
      .filter((ids) => ids.length > 0);
    expect(batches).toEqual([
      [`jira:${ymd(-2)}`, `slack:${ymd(-2)}`],
      [`jira:${ymd(-1)}`, `slack:${ymd(-1)}`],
    ]);
  });

  it('cancel lets the current summary finish, starts nothing new, and still hands it to the wiki', async () => {
    const { svc, scheduler } = twoConnectorsTwoDays();
    let release!: () => void;
    scheduler.generateDailySummaryFor.mockImplementationOnce(
      (a: { connectorId: string; date: string }) =>
        new Promise((r) => (release = () => r({ summary: { id: `${a.connectorId}:${a.date}` }, sourceLabel: 'x' }))),
    );
    await svc.start(USER, 3);
    await new Promise((r) => setTimeout(r, 10));
    expect(svc.cancel(USER)?.status).toBe('cancelling');
    release();
    await settle(svc, 'cancelling');

    expect(svc.status(USER)).toMatchObject({ status: 'cancelled', completed: 1, total: 4 });
    expect(scheduler.generateDailySummaryFor).toHaveBeenCalledTimes(1);
    const emitted = scheduler.emitSummaries.mock.calls.flatMap((c) => (c[1] as Array<{ summary: { id: string } }>).map((x) => x.summary.id));
    expect(emitted).toEqual([`jira:${ymd(-2)}`]);
  });
});
