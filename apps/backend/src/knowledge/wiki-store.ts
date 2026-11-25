import { Inject, Injectable } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { WikiGraphDto, WikiPageMeta, WikiPageType } from '@kuros/shared';
import { STORAGE, type StorageService } from '../storage/storage.service';
import { WIKI_SCHEMA_MD } from './prompts/wiki-schema';

/**
 * File-backed LLM wiki (https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).
 *
 *   users/<id>/wiki/
 *     SCHEMA.md          conventions the LLM follows (co-evolved with the user)
 *     index.md           catalog of every page, regenerated from frontmatter
 *     log.md             append-only record of ingests / queries
 *     sources/...        one page per ingested summary (raw summaries stay immutable elsewhere)
 *     people/ teams/ projects/ topics/   entity + concept pages the LLM maintains
 *     daily/<date>.md    per-day highlights synthesis
 *     answers/...        chat answers filed back into the wiki
 *
 * Page ids are paths relative to the wiki root without `.md`; links use
 * Obsidian-style `[[path|Label]]`.
 */

export const PAGE_DIRS: Record<string, WikiPageType> = {
  sources: 'source',
  people: 'person',
  teams: 'team',
  projects: 'project',
  topics: 'topic',
  daily: 'daily',
  answers: 'answer',
};

/** Directories the ingest LLM is allowed to create/update pages in. */
export const ENTITY_DIRS = ['people', 'teams', 'projects', 'topics'] as const;

const SECTION_ORDER: Array<{ dir: string; heading: string }> = [
  { dir: 'daily', heading: 'Daily highlights' },
  { dir: 'people', heading: 'People' },
  { dir: 'teams', heading: 'Teams' },
  { dir: 'projects', heading: 'Projects' },
  { dir: 'topics', heading: 'Topics' },
  { dir: 'answers', heading: 'Filed answers' },
  { dir: 'sources', heading: 'Sources' },
];

const PATH_RE = /^(sources|people|teams|projects|topics|daily|answers)\/[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;
const LINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;

export interface WikiPage {
  meta: WikiPageMeta;
  body: string;
}

export function slugify(input: string, max = 60): string {
  const s = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
  return s || 'untitled';
}

export function shortHash(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 6);
}

/** Normalise an LLM- or user-supplied page reference to a canonical page path, or null if invalid. */
export function normalizePagePath(raw: string): string | null {
  let p = raw.trim().replace(/^\/+/, '').replace(/\.md$/i, '').toLowerCase();
  p = p.replace(/^wiki\//, '');
  if (p.includes('..') || !PATH_RE.test(p)) return null;
  return p;
}

export function pageTypeFor(path: string): WikiPageType {
  return PAGE_DIRS[path.split('/')[0]] ?? 'topic';
}

export function extractLinks(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(LINK_RE)) {
    const p = normalizePagePath(m[1]);
    if (p) out.add(p);
  }
  return [...out];
}

// --- frontmatter -----------------------------------------------------------
// Values are written as JSON scalars / flow arrays, which are valid YAML, so
// the wiki stays readable by Obsidian + Dataview while parsing stays trivial.

function serializeFrontmatter(meta: WikiPageMeta): string {
  const fields: Array<[string, unknown]> = [
    ['title', meta.title],
    ['type', meta.type],
    ['summary', meta.summary],
    ['created', meta.created],
    ['updated', meta.updated],
    ['sources', meta.sources],
    ['tags', meta.tags],
  ];
  const lines = fields.map(([k, v]) => `${k}: ${JSON.stringify(v ?? null)}`);
  return `---\n${lines.join('\n')}\n---\n`;
}

function parsePage(path: string, text: string): WikiPage {
  const meta: WikiPageMeta = {
    path,
    title: path.split('/').pop() ?? path,
    type: pageTypeFor(path),
    summary: '',
    created: null,
    updated: null,
    sources: [],
    tags: [],
  };
  let body = text;
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (fm) {
    body = text.slice(fm[0].length);
    for (const line of fm[1].split('\n')) {
      const idx = line.indexOf(':');
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      const rawVal = line.slice(idx + 1).trim();
      let val: unknown = rawVal;
      try {
        val = JSON.parse(rawVal);
      } catch {
        /* plain YAML scalar (e.g. hand-edited) */
      }
      switch (key) {
        case 'title':
        case 'summary':
          if (typeof val === 'string') meta[key] = val;
          break;
        case 'created':
        case 'updated':
          meta[key] = typeof val === 'string' ? val : null;
          break;
        case 'sources':
        case 'tags':
          if (Array.isArray(val)) meta[key] = val.filter((x): x is string => typeof x === 'string');
          break;
        case 'type':
          if (typeof val === 'string' && Object.values(PAGE_DIRS).includes(val as WikiPageType)) {
            meta.type = val as WikiPageType;
          }
          break;
      }
    }
  }
  return { meta, body: body.replace(/^\n+/, '') };
}

@Injectable()
export class WikiStore {
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(@Inject(STORAGE) private readonly storage: StorageService) {}

  /** Serialises wiki mutations per user so concurrent ingests/highlights never interleave writes. */
  async withLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(userId) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(fn);
    const tail = run.catch(() => undefined);
    this.locks.set(userId, tail);
    try {
      return await run;
    } finally {
      if (this.locks.get(userId) === tail) this.locks.delete(userId);
    }
  }

  root(userId: string): string {
    return `users/${userId}/wiki`;
  }

  private file(userId: string, rel: string): string {
    return `${this.root(userId)}/${rel}`;
  }

  async ensureInitialized(userId: string): Promise<void> {
    if (!(await this.storage.exists(this.file(userId, 'SCHEMA.md')))) {
      await this.storage.write(this.file(userId, 'SCHEMA.md'), WIKI_SCHEMA_MD);
    }
    if (!(await this.storage.exists(this.file(userId, 'log.md')))) {
      await this.storage.write(
        this.file(userId, 'log.md'),
        '# Wiki log\n\nAppend-only record of ingests, queries and maintenance. `grep "^## \\[" log.md | tail` shows recent entries.\n',
      );
    }
    if (!(await this.storage.exists(this.file(userId, 'index.md')))) {
      await this.rebuildIndex(userId);
    }
  }

  async readSchema(userId: string): Promise<string> {
    await this.ensureInitialized(userId);
    return this.storage.read(this.file(userId, 'SCHEMA.md'));
  }

  async readIndex(userId: string): Promise<string> {
    await this.ensureInitialized(userId);
    return this.storage.read(this.file(userId, 'index.md'));
  }

  async readPage(userId: string, path: string): Promise<WikiPage | null> {
    const rel = this.file(userId, `${path}.md`);
    if (!(await this.storage.exists(rel))) return null;
    return parsePage(path, await this.storage.read(rel));
  }

  async writePage(userId: string, page: WikiPage): Promise<void> {
    const body = page.body.trim() + '\n';
    await this.storage.write(this.file(userId, `${page.meta.path}.md`), serializeFrontmatter(page.meta) + '\n' + body);
  }

  async writeRaw(userId: string, rel: string, content: string): Promise<void> {
    await this.storage.write(this.file(userId, rel), content);
  }

  async readRaw(userId: string, rel: string): Promise<string | null> {
    const p = this.file(userId, rel);
    if (!(await this.storage.exists(p))) return null;
    return this.storage.read(p);
  }

  /** All pages (excluding SCHEMA/index/log), parsed. */
  async listPages(userId: string): Promise<WikiPage[]> {
    const rootAbs = this.storage.absolutePath(this.root(userId));
    let entries: string[];
    try {
      entries = await fs.readdir(rootAbs, { recursive: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const pages: WikiPage[] = [];
    for (const entry of entries) {
      const rel = entry.split('\\').join('/');
      if (!rel.endsWith('.md') || !rel.includes('/')) continue;
      const path = normalizePagePath(rel);
      if (!path) continue;
      try {
        pages.push(parsePage(path, await this.storage.read(this.file(userId, rel))));
      } catch {
        /* unreadable file — skip */
      }
    }
    return pages;
  }

  async rebuildIndex(userId: string): Promise<void> {
    const pages = await this.listPages(userId);
    const now = new Date().toISOString();
    const lines: string[] = [
      '# Wiki index',
      '',
      `_Auto-maintained catalog of ${pages.length} pages. Last rebuilt ${now}._`,
      '',
    ];
    for (const { dir, heading } of SECTION_ORDER) {
      const inDir = pages
        .filter((p) => p.meta.path.startsWith(`${dir}/`))
        .sort((a, b) =>
          dir === 'sources' || dir === 'daily'
            ? b.meta.path.localeCompare(a.meta.path)
            : a.meta.title.localeCompare(b.meta.title),
        );
      if (inDir.length === 0) continue;
      lines.push(`## ${heading}`, '');
      for (const p of inDir) {
        const extras = [
          p.meta.updated ? `updated ${p.meta.updated.slice(0, 10)}` : null,
          p.meta.sources.length ? `${p.meta.sources.length} sources` : null,
        ].filter(Boolean);
        lines.push(
          `- [[${p.meta.path}|${p.meta.title}]] — ${p.meta.summary || '(no summary)'}${
            extras.length ? ` _(${extras.join(', ')})_` : ''
          }`,
        );
      }
      lines.push('');
    }
    await this.storage.write(this.file(userId, 'index.md'), lines.join('\n'));
  }

  /**
   * Index trimmed for prompts: keeps every entity/topic line but only the most
   * recent sources/daily entries so the catalog stays within context budget.
   */
  async readIndexForPrompt(userId: string, maxRecentSources = 60, maxChars = 60_000): Promise<string> {
    const index = await this.readIndex(userId);
    const out: string[] = [];
    let section = '';
    let sectionCount = 0;
    for (const line of index.split('\n')) {
      if (line.startsWith('## ')) {
        section = line;
        sectionCount = 0;
        out.push(line);
        continue;
      }
      if (line.startsWith('- ') && (section === '## Sources' || section === '## Daily highlights')) {
        sectionCount++;
        if (sectionCount > maxRecentSources) continue;
      }
      out.push(line);
    }
    const text = out.join('\n');
    return text.length > maxChars ? text.slice(0, maxChars) + '\n…(index truncated)' : text;
  }

  async appendLog(userId: string, op: string, title: string, details: string[] = []): Promise<void> {
    await this.ensureInitialized(userId);
    const date = new Date().toISOString().slice(0, 10);
    const entry = [`\n## [${date}] ${op} | ${title}`, ...details.map((d) => `- ${d}`)].join('\n') + '\n';
    await this.storage.append(this.file(userId, 'log.md'), entry);
  }

  async recentLog(userId: string, n = 15): Promise<string[]> {
    const log = await this.readRaw(userId, 'log.md');
    if (!log) return [];
    return log
      .split('\n')
      .filter((l) => l.startsWith('## ['))
      .map((l) => l.slice(3))
      .slice(-n)
      .reverse();
  }

  async backlinks(userId: string, path: string, pages?: WikiPage[]): Promise<string[]> {
    const all = pages ?? (await this.listPages(userId));
    return all.filter((p) => p.meta.path !== path && extractLinks(p.body).includes(path)).map((p) => p.meta.path);
  }

  /** Link graph over every page, built from body wikilinks (the same model as Obsidian's graph view). */
  async graph(userId: string, pages?: WikiPage[]): Promise<WikiGraphDto> {
    const all = pages ?? (await this.listPages(userId));
    const nodes = new Map<string, WikiGraphDto['nodes'][number]>();
    for (const p of all) {
      nodes.set(p.meta.path, {
        id: p.meta.path,
        title: p.meta.title,
        type: p.meta.type,
        summary: p.meta.summary,
        degree: 0,
        missing: false,
      });
    }
    const seen = new Set<string>();
    const links: WikiGraphDto['links'] = [];
    for (const p of all) {
      for (const target of extractLinks(p.body)) {
        if (target === p.meta.path) continue;
        // Undirected de-dupe: A→B and B→A render as one edge.
        const key = p.meta.path < target ? `${p.meta.path}|${target}` : `${target}|${p.meta.path}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!nodes.has(target)) {
          nodes.set(target, {
            id: target,
            title: target.split('/').pop()!.replace(/-/g, ' '),
            type: pageTypeFor(target),
            summary: '',
            degree: 0,
            missing: true,
          });
        }
        links.push({ source: p.meta.path, target });
        nodes.get(p.meta.path)!.degree++;
        nodes.get(target)!.degree++;
      }
    }
    return { nodes: [...nodes.values()], links };
  }

  /**
   * Naive keyword search (the gist's "simple search script"): scores pages by
   * term hits in title, summary, tags and body. Good enough at personal-wiki scale.
   */
  async search(userId: string, query: string, limit = 15, pages?: WikiPage[]): Promise<WikiPage[]> {
    const terms = [
      ...new Set(
        query
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
      ),
    ];
    if (terms.length === 0) return [];
    const all = pages ?? (await this.listPages(userId));
    const scored = all
      .map((p) => {
        const title = p.meta.title.toLowerCase();
        const summary = p.meta.summary.toLowerCase();
        const tags = p.meta.tags.join(' ').toLowerCase();
        const body = p.body.toLowerCase();
        let score = 0;
        for (const t of terms) {
          if (title.includes(t)) score += 6;
          if (summary.includes(t)) score += 3;
          if (tags.includes(t)) score += 2;
          if (p.meta.path.includes(t)) score += 2;
          score += Math.min(countOccurrences(body, t), 5);
        }
        return { p, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((x) => x.p);
  }
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

const STOPWORDS = new Set(
  'the and for are was were with what who whom when where which why how did does has have had this that these those from into about over under then than they them their there you your our out not can could would should will just any all some been being also its get got today yesterday week'.split(
    ' ',
  ),
);
