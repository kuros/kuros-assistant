import { z } from 'zod';

export const jiraConfigSchema = z.object({
  baseUrl: z.string().url(),
  email: z.string().email(),
  apiToken: z.string().min(1),
  projectKeys: z.array(z.string().min(1)).min(1, 'At least one project key required'),
  /**
   * Optional JQL narrowing which issues are synced, ANDed onto the project query,
   * e.g. "assignee = currentUser() OR watcher = currentUser()". Empty = every updated issue.
   */
  jqlFilter: z
    .string()
    .max(2000)
    .refine((v) => !/\border\s+by\b/i.test(v), 'Leave out ORDER BY; it is added automatically')
    .optional(),
});

export type JiraConfigParsed = z.infer<typeof jiraConfigSchema>;
