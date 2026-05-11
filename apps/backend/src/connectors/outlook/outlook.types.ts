import { z } from 'zod';

export const outlookConfigSchema = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().min(1),
  cachedTokenFilePath: z.string().min(1),
  monitoredAddresses: z.array(z.string().email()).min(1),
  teamLabels: z.record(z.string(), z.string()).default({}),
});

export type OutlookConfigParsed = z.infer<typeof outlookConfigSchema>;
