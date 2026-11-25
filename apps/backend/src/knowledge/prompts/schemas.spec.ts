import { ingestPlanSchema, ingestWriteSchema } from './ingest.prompt';
import { highlightsSchema } from './highlights.prompt';
import { extractionSchema } from '../../claude/prompts/extraction.prompt';

// Regression: with the Claude Code provider, schema limits are only prompt instructions. A model
// that overshoots (a 430-char "one-line" summary) used to fail the whole day's ingest.
describe('LLM output schemas are lenient about length', () => {
  it('trims an over-long plan summary instead of rejecting the plan', () => {
    const long = 'x'.repeat(430);
    const res = ingestPlanSchema.safeParse({
      sources: [{ path: 'sources/daily/2026-11-23/slack-a-abc123', title: 'T', summary: long }],
      pages: Array.from({ length: 40 }, (_, i) => ({ path: `people/p${i}`, title: `P${i}` })),
    });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.sources[0].summary).toHaveLength(400);
    expect(res.data.sources[0].summary.endsWith('…')).toBe(true);
    expect(res.data.sources[0].tags).toEqual([]);
    expect(res.data.pages).toHaveLength(24);
  });

  it('still rejects structurally wrong output', () => {
    expect(ingestPlanSchema.safeParse({ sources: [{ path: 'x', title: '', summary: 's' }], pages: [] }).success).toBe(false);
    expect(ingestWriteSchema.safeParse({ pages: [] }).success).toBe(false);
  });

  it('clamps highlights and extraction fields too', () => {
    const h = highlightsSchema.parse({
      headline: 'h'.repeat(350),
      highlights: Array.from({ length: 15 }, () => ({ title: 't', detail: 'd'.repeat(900), importance: 'high', category: 'other' })),
    });
    expect(h.headline).toHaveLength(300);
    expect(h.highlights).toHaveLength(12);
    expect(h.highlights[0].detail).toHaveLength(800);

    const e = extractionSchema.parse({
      actionItems: [{ title: 'a'.repeat(250) }],
      risks: [{ title: 'r', severity: 'high', detail: 'z'.repeat(1200) }],
    });
    expect(e.actionItems[0].title).toHaveLength(200);
    expect(e.risks[0].detail).toHaveLength(1000);
  });
});
