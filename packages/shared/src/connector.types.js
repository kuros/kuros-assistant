import { z } from 'zod';
// ---- Zod schemas (shared so FE forms and BE validateConfig use the same schema) ----
export const SlackConnectorConfigSchema = z
    .object({
    botToken: z.string().regex(/^xoxb-/, 'must start with xoxb-'),
    appToken: z
        .string()
        .regex(/^xapp-/, 'must start with xapp-')
        .optional()
        .or(z.literal('')),
    teamId: z.string().regex(/^T[A-Z0-9]+$/, 'expected Slack team id like T01234'),
    channelIds: z.array(z.string().regex(/^[CG][A-Z0-9]+$/)).min(1, 'select at least one channel'),
})
    .strict();
export const OutlookConnectorConfigSchema = z
    .object({
    tenantId: z.string().min(1),
    clientId: z.string().uuid(),
    cachedTokenFilePath: z.string().min(1),
    monitoredAddresses: z.array(z.string().email()).min(1),
    teamLabels: z.record(z.string().email(), z.string().min(1).max(120)),
    folderId: z.string().min(1),
})
    .strict();
export const JiraConnectorConfigSchema = z
    .object({
    baseUrl: z.string().url(),
    email: z.string().email(),
    apiToken: z.string().min(1),
    projectKeys: z.array(z.string().min(1)).min(1, 'select at least one project'),
})
    .strict();
