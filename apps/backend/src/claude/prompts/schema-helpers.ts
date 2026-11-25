import { z } from 'zod';

/**
 * Lenient length limits for LLM output. With the Claude Code provider, JSON-schema limits are
 * only instructions in the prompt, and a model occasionally overshoots (e.g. a 430-char
 * "one-line" summary). Rejecting the whole response for that wastes the call, so over-long
 * strings are trimmed and over-long arrays are cut instead.
 */
export const clampedString = (max: number, min = 0) =>
  z
    .string()
    .min(min)
    .transform((v) => (v.length > max ? `${v.slice(0, max - 1)}…` : v));

export const clampedArray = <T extends z.ZodTypeAny>(item: T, max: number) =>
  z.array(item).transform((items) => items.slice(0, max));
