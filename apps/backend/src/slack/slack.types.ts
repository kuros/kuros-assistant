import { z } from 'zod';

export const slackConfigSchema = z.object({
  botToken: z.string().regex(/^xoxb-/, 'botToken must start with xoxb-'),
  appToken: z.string().regex(/^xapp-/, 'appToken must start with xapp-'),
  teamId: z.string().min(1),
  channelIds: z.array(z.string().min(1)).min(1, 'At least one channelId required'),
});

export type SlackConfigParsed = z.infer<typeof slackConfigSchema>;
