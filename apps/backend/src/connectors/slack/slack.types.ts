import { z } from 'zod';

export const slackConfigSchema = z.object({
  token: z.string().regex(/^xox[bp]-/, 'token must be a bot token (xoxb-) or user token (xoxp-)'),
  teamId: z.string().min(1),
  channelIds: z.array(z.string().min(1)).min(1, 'At least one channelId required'),
});

export type SlackConfigParsed = z.infer<typeof slackConfigSchema>;
