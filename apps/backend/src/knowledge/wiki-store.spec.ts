import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { LocalFsStorage } from '../storage/storage.service';
import { WikiStore, extractLinks, normalizePagePath, slugify } from './wiki-store';

describe('wiki path helpers', () => {
  it('normalises valid page paths and rejects others', () => {
    expect(normalizePagePath('people/Jane-Doe.md')).toBe('people/jane-doe');
    expect(normalizePagePath('/topics/on-call')).toBe('topics/on-call');
    expect(normalizePagePath('sources/daily/2026-11-24/slack-eng-a1b2c3')).toBe(
      'sources/daily/2026-11-24/slack-eng-a1b2c3',
    );
    expect(normalizePagePath('people/../secrets')).toBeNull();
    expect(normalizePagePath('random/page')).toBeNull();
    expect(normalizePagePath('people/')).toBeNull();
  });

  it('extracts wikilinks with labels and anchors', () => {
    const body = 'See [[people/jane-doe|Jane]] and [[projects/checkout-v2#status]] and [[bogus/x]].';
    expect(extractLinks(body)).toEqual(['people/jane-doe', 'projects/checkout-v2']);
  });

  it('slugifies', () => {
    expect(slugify('  Zoë O’Brien — Platform ')).toBe('zoe-o-brien-platform');
    expect(slugify('!!!')).toBe('untitled');
  });
});

describe('WikiStore', () => {
  let dir: string;
  let store: WikiStore;
  const user = 'u1';

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wiki-'));
    const storage = new LocalFsStorage({ get: () => dir } as unknown as ConfigService);
    store = new WikiStore(storage);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('initialises schema, log and index', async () => {
    await store.ensureInitialized(user);
    expect(await store.readSchema(user)).toContain('# Wiki schema');
    expect(await store.readIndex(user)).toContain('# Wiki index');
    expect(await store.readRaw(user, 'log.md')).toContain('# Wiki log');
  });

  it('round-trips frontmatter, builds index, backlinks and search', async () => {
    await store.writePage(user, {
      meta: {
        path: 'people/jane-doe',
        title: 'Jane "JD" Doe',
        type: 'person',
        summary: 'Payments tech lead: owns checkout',
        created: '2026-11-01T00:00:00.000Z',
        updated: '2026-11-24T00:00:00.000Z',
        sources: ['sources/daily/2026-11-24/slack-eng-abc123'],
        tags: ['payments'],
      },
      body: '# Jane Doe\n\nLeads [[teams/payments|Payments]].',
    });
    await store.writePage(user, {
      meta: {
        path: 'teams/payments',
        title: 'Payments',
        type: 'team',
        summary: 'Checkout and billing',
        created: null,
        updated: null,
        sources: [],
        tags: [],
      },
      body: '# Payments\n\nLed by [[people/jane-doe|Jane]].',
    });

    const page = await store.readPage(user, 'people/jane-doe');
    expect(page?.meta.title).toBe('Jane "JD" Doe');
    expect(page?.meta.summary).toBe('Payments tech lead: owns checkout');
    expect(page?.meta.sources).toEqual(['sources/daily/2026-11-24/slack-eng-abc123']);
    expect(page?.body.startsWith('# Jane Doe')).toBe(true);

    await store.rebuildIndex(user);
    const index = await store.readIndex(user);
    expect(index).toContain('## People');
    expect(index).toContain('[[people/jane-doe|Jane "JD" Doe]] — Payments tech lead');
    expect(index).toContain('## Teams');

    expect(await store.backlinks(user, 'teams/payments')).toEqual(['people/jane-doe']);

    const graph = await store.graph(user);
    // jane<->payments links both ways: one undirected edge, no unresolved nodes.
    expect(graph.links).toHaveLength(1);
    expect(graph.nodes.find((n) => n.id === 'people/jane-doe')?.degree).toBe(1);
    expect(graph.nodes.some((n) => n.missing)).toBe(false);
    const hits = await store.search(user, 'who leads checkout?');
    expect(hits[0]?.meta.path).toBe('people/jane-doe');
  });

  it('adds unresolved link targets as missing nodes', async () => {
    await store.writePage(user, {
      meta: { path: 'topics/on-call', title: 'On-call', type: 'topic', summary: '', created: null, updated: null, sources: [], tags: [] },
      body: 'Run by [[teams/sre|SRE]].',
    });
    const graph = await store.graph(user);
    expect(graph.nodes.find((n) => n.id === 'teams/sre')).toMatchObject({ missing: true, type: 'team', degree: 1 });
  });

  it('appends log entries in the greppable format', async () => {
    await store.appendLog(user, 'ingest', 'Slack #eng (2026-11-24)', ['source: [[sources/x]]']);
    const recent = await store.recentLog(user);
    expect(recent[0]).toMatch(/^\[\d{4}-\d{2}-\d{2}\] ingest \| Slack #eng \(2026-11-24\)$/);
  });

  it('serialises work under the per-user lock', async () => {
    const order: string[] = [];
    const slow = store.withLock(user, async () => {
      await new Promise((r) => setTimeout(r, 30));
      order.push('a');
    });
    const failing = store.withLock(user, async () => {
      order.push('b');
      throw new Error('boom');
    });
    const fast = store.withLock(user, async () => {
      order.push('c');
    });
    await Promise.allSettled([slow, failing, fast]);
    expect(order).toEqual(['a', 'b', 'c']);
    await expect(failing).rejects.toThrow('boom');
  });
});
