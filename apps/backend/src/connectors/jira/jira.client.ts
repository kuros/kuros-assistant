export interface JiraComment {
  id: string;
  author?: { displayName?: string; emailAddress?: string; accountId: string } | null;
  body?: { content?: { content?: { text?: string }[] }[] } | null;
  created: string;
  updated?: string;
}

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
    comment?: {
      comments: JiraComment[];
      total: number;
      maxResults: number;
      startAt: number;
    } | null;
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
    nextPageToken: string | null = null,
  ): Promise<{ issues: JiraIssue[]; isLast: boolean; nextPageToken?: string }> {
    let jql = `project = "${projectKey}" AND updated >= -1w ORDER BY updated DESC`;
    if (updatedSince) {
      jql = `project = "${projectKey}" AND updated >= "${updatedSince}" ORDER BY updated ASC`;
    }
    const params = new URLSearchParams({
      jql,
      maxResults: '100',
      fields: 'summary,description,updated,reporter,status,priority,assignee,comment',
    });
    if (nextPageToken) params.set('nextPageToken', nextPageToken);
    return this.request<{ issues: JiraIssue[]; isLast: boolean; nextPageToken?: string }>(
      `/search/jql?${params.toString()}`,
    );
  }

  async allIssuesSince(
    projectKey: string,
    updatedSince: string | null,
  ): Promise<JiraIssue[]> {
    const all: JiraIssue[] = [];
    let nextPageToken: string | null = null;
    for (;;) {
      const page = await this.searchIssues(projectKey, updatedSince, nextPageToken);
      all.push(...page.issues);
      if (page.isLast || !page.nextPageToken) break;
      nextPageToken = page.nextPageToken;
    }
    return all;
  }

  async latestCommentsForIssue(issueKeyOrId: string, limit: number): Promise<JiraComment[]> {
    const params = new URLSearchParams({
      startAt: '0',
      maxResults: String(limit),
      orderBy: '-created',
    });
    const page = await this.request<{
      comments: JiraComment[];
      total: number;
      maxResults: number;
      startAt: number;
    }>(`/issue/${encodeURIComponent(issueKeyOrId)}/comment?${params.toString()}`);
    // API returns newest-first; reverse so output is chronological (oldest-first).
    return [...page.comments].reverse();
  }
}
