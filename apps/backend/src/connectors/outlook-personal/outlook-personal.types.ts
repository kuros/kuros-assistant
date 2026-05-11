import { z } from 'zod';

export const outlookPersonalConfigSchema = z
  .object({
    clientId: z.string().uuid(),
    emailAddress: z.string().email(),
    startDate: z.string().optional(),
  })
  .strict();

export type OutlookPersonalConfigParsed = z.infer<typeof outlookPersonalConfigSchema>;
