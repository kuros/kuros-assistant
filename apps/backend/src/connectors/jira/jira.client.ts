export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: { content?: { content?: { text?: string }[] }[] } | null;
    updated: string;
    reporter?: { displayName?: string; emailAddress?: string; accountId: string } | null;
    status: { name: string };
    priority?: { name: string } | null;
    assignee?: { displayName?: string; emailAddress?: string; accountId: string } | null;
  };
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
}

export class JiraClient {
  private readonly authHeader: string;

  constructor(
    private readonly baseUrl: string,
    email: string,
    apiToken: string,
  ) {
    this.authHeader = 'Basic ' + Buffer.from(`${email}:${apiToken}`).toString('base64');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/rest/api/3${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Jira API ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  async getProject(projectKey: string): Promise<JiraProject> {
    return this.request<JiraProject>(`/project/${projectKey}`);
  }

  async myself(): Promise<{ displayName: string; emailAddress: string }> {
    return this.request('/myself');
  }

  async searchIssues(
    projectKey: string,
    updatedSince: string | null,
    startAt = 0,
  ): Promise<{ issues: JiraIssue[]; total: number; maxResults: number }> {
    let jql = `project = "${projectKey}" AND updated >= -1w ORDER BY updated DESC`;
    if (updatedSince) {
      jql = `project = "${projectKey}" AND updated >= "${updatedSince}" ORDER BY updated ASC`;
    }
    const params = new URLSearchParams({
      jql,
      startAt: String(startAt),
      maxResults: '100',
      fields: 'summary,description,updated,reporter,status,priority,assignee',
    });
    return this.request<{ issues: JiraIssue[]; total: number; maxResults: number }>(
      `/search/jql?${params.toString()}`,
    );
  }

  async allIssuesSince(
    projectKey: string,
    updatedSince: string | null,
  ): Promise<JiraIssue[]> {
    const all: JiraIssue[] = [];
    let startAt = 0;
    let total: number | null = null;
    do {
      const page = await this.searchIssues(projectKey, updatedSince, startAt);
      total = page.total;
      all.push(...page.issues);
      startAt += page.maxResults;
    } while (all.length < (total ?? 0));
    return all;
  }
}
