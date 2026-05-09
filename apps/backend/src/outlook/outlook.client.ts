import 'isomorphic-fetch';
import { Client } from '@microsoft/microsoft-graph-client';

export interface OutlookMessage {
  id: string;
  receivedDateTime: string;
  subject: string;
  bodyPreview: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: { emailAddress?: { address?: string } }[];
}

export class OutlookClient {
  private readonly client: Client;

  constructor(accessToken: string) {
    this.client = Client.init({
      authProvider: (done) => done(null, accessToken),
    });
  }

  async messagesSince(
    deltaLink: string | null,
    monitoredAddresses: string[],
  ): Promise<{ messages: OutlookMessage[]; deltaLink: string | null }> {
    const collected: OutlookMessage[] = [];
    let request = deltaLink
      ? this.client.api(deltaLink)
      : this.client
          .api('/me/mailFolders/Inbox/messages/delta')
          .select('id,receivedDateTime,subject,bodyPreview,from,toRecipients')
          .top(50);

    let nextLink: string | undefined;
    let nextDelta: string | undefined;
    do {
      const resp = await request.get();
      const value = (resp.value ?? []) as OutlookMessage[];
      for (const msg of value) {
        const recipients = (msg.toRecipients ?? [])
          .map((r) => r.emailAddress?.address?.toLowerCase())
          .filter((x): x is string => !!x);
        if (
          monitoredAddresses.length === 0 ||
          monitoredAddresses.some((addr) => recipients.includes(addr.toLowerCase()))
        ) {
          collected.push(msg);
        }
      }
      nextLink = resp['@odata.nextLink'];
      nextDelta = resp['@odata.deltaLink'];
      if (nextLink) request = this.client.api(nextLink);
    } while (nextLink);

    return { messages: collected, deltaLink: nextDelta ?? deltaLink };
  }
}
