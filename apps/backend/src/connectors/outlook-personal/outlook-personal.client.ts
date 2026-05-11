import 'isomorphic-fetch';
import { Client } from '@microsoft/microsoft-graph-client';

export interface OutlookPersonalMessage {
  id: string;
  receivedDateTime: string;
  subject: string;
  bodyPreview: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: { emailAddress?: { address?: string } }[];
}

export class OutlookPersonalClient {
  private readonly client: Client;

  constructor(accessToken: string) {
    this.client = Client.init({
      authProvider: (done) => done(null, accessToken),
    });
  }

  // On the first call (deltaLink === null) we filter by receivedDateTime so we
  // only pull messages from startDate forward. The response includes a deltaLink
  // which is stored as the cursor and used on all subsequent calls instead of
  // re-scanning from the date filter — this gives us true incremental updates.
  async messagesSince(
    deltaLink: string | null,
    startDate: string,
  ): Promise<{ messages: OutlookPersonalMessage[]; deltaLink: string | null }> {
    const collected: OutlookPersonalMessage[] = [];

    let request = deltaLink
      ? this.client.api(deltaLink)
      : this.client
          .api('/me/mailFolders/Inbox/messages/delta')
          .filter(`receivedDateTime ge ${startDate}`)
          .select('id,receivedDateTime,subject,bodyPreview,from,toRecipients')
          .top(50);

    let nextLink: string | undefined;
    let nextDelta: string | undefined;
    do {
      const resp = await request.get();
      collected.push(...((resp.value ?? []) as OutlookPersonalMessage[]));
      nextLink = resp['@odata.nextLink'] as string | undefined;
      nextDelta = resp['@odata.deltaLink'] as string | undefined;
      if (nextLink) request = this.client.api(nextLink);
    } while (nextLink);

    return { messages: collected, deltaLink: nextDelta ?? deltaLink };
  }
}
