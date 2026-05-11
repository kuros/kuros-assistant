import { z } from 'zod';

export const jiraConfigSchema = z.object({
  baseUrl: z.string().url(),
  email: z.string().email(),
  apiToken: z.string().min(1),
  projectKeys: z.array(z.string().min(1)).min(1, 'At least one project key required'),
});

export type JiraConfigParsed = z.infer<typeof jiraConfigSchema>;
