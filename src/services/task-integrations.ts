import { getConfig } from '../lib/config.js';
import type { TaskCreationRequest, TaskCreationResult, TaskProvider } from '../types.js';

// ── Linear ───────────────────────────────────────────────────────────

async function createLinearTask(request: TaskCreationRequest): Promise<TaskCreationResult> {
  const config = getConfig();

  if (!config.linearApiKey) {
    return {
      success: false,
      provider: 'linear',
      taskId: '',
      url: '',
      error: 'LINEAR_API_KEY not set. Get your API key at https://linear.app/settings/api',
    };
  }

  const priorityMap: Record<string, number> = {
    urgent: 1,
    high: 2,
    medium: 3,
    low: 4,
  };

  const mutation = `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          url
        }
      }
    }
  `;

  const variables = {
    input: {
      title: request.title,
      description: request.description,
      priority: priorityMap[request.priority] ?? 3,
      ...(request.dueDate ? { dueDate: request.dueDate } : {}),
    },
  };

  try {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: config.linearApiKey,
      },
      body: JSON.stringify({ query: mutation, variables }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        provider: 'linear',
        taskId: '',
        url: '',
        error: `Linear API error: ${response.status} ${text}`,
      };
    }

    const body = await response.json() as {
      data?: {
        issueCreate?: {
          success: boolean;
          issue?: { id: string; identifier: string; url: string };
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (body.errors?.length) {
      return {
        success: false,
        provider: 'linear',
        taskId: '',
        url: '',
        error: body.errors.map((e) => e.message).join(', '),
      };
    }

    const issue = body.data?.issueCreate?.issue;
    if (!issue) {
      return {
        success: false,
        provider: 'linear',
        taskId: '',
        url: '',
        error: 'No issue returned from Linear',
      };
    }

    return {
      success: true,
      provider: 'linear',
      taskId: issue.identifier,
      url: issue.url,
    };
  } catch (err) {
    return {
      success: false,
      provider: 'linear',
      taskId: '',
      url: '',
      error: `Linear API request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Todoist ──────────────────────────────────────────────────────────

async function createTodoistTask(request: TaskCreationRequest): Promise<TaskCreationResult> {
  const config = getConfig();

  if (!config.todoistApiToken) {
    return {
      success: false,
      provider: 'todoist',
      taskId: '',
      url: '',
      error: 'TODOIST_API_TOKEN not set. Get your API token at https://todoist.com/app/settings/integrations/developer',
    };
  }

  const priorityMap: Record<string, number> = {
    urgent: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  try {
    const response = await fetch('https://api.todoist.com/rest/v2/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.todoistApiToken}`,
      },
      body: JSON.stringify({
        content: request.title,
        description: request.description,
        priority: priorityMap[request.priority] ?? 2,
        ...(request.dueDate ? { due_date: request.dueDate } : {}),
        ...(request.labels?.length ? { labels: request.labels } : {}),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        provider: 'todoist',
        taskId: '',
        url: '',
        error: `Todoist API error: ${response.status} ${text}`,
      };
    }

    const body = await response.json() as { id: string; url: string };

    return {
      success: true,
      provider: 'todoist',
      taskId: body.id,
      url: body.url || `https://todoist.com/app/task/${body.id}`,
    };
  } catch (err) {
    return {
      success: false,
      provider: 'todoist',
      taskId: '',
      url: '',
      error: `Todoist API request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Jira ─────────────────────────────────────────────────────────────

async function createJiraTask(request: TaskCreationRequest): Promise<TaskCreationResult> {
  const config = getConfig();

  if (!config.jiraDomain || !config.jiraEmail || !config.jiraApiToken) {
    return {
      success: false,
      provider: 'jira',
      taskId: '',
      url: '',
      error:
        'Jira not configured. Set JIRA_DOMAIN, JIRA_EMAIL, and JIRA_API_TOKEN environment variables. ' +
        'Get an API token at https://id.atlassian.com/manage-profile/security/api-tokens',
    };
  }

  const auth = Buffer.from(`${config.jiraEmail}:${config.jiraApiToken}`).toString('base64');
  const baseUrl = `https://${config.jiraDomain}.atlassian.net`;

  try {
    const response = await fetch(`${baseUrl}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
      body: JSON.stringify({
        fields: {
          summary: request.title,
          description: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: request.description,
                  },
                ],
              },
            ],
          },
          issuetype: { name: 'Task' },
          ...(request.dueDate ? { duedate: request.dueDate } : {}),
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        provider: 'jira',
        taskId: '',
        url: '',
        error: `Jira API error: ${response.status} ${text}`,
      };
    }

    const body = await response.json() as { id: string; key: string; self: string };

    return {
      success: true,
      provider: 'jira',
      taskId: body.key,
      url: `${baseUrl}/browse/${body.key}`,
    };
  } catch (err) {
    return {
      success: false,
      provider: 'jira',
      taskId: '',
      url: '',
      error: `Jira API request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Dispatcher ───────────────────────────────────────────────────────

export async function createTask(request: TaskCreationRequest): Promise<TaskCreationResult> {
  switch (request.provider) {
    case 'linear':
      return createLinearTask(request);
    case 'todoist':
      return createTodoistTask(request);
    case 'jira':
      return createJiraTask(request);
    default:
      return {
        success: false,
        provider: request.provider,
        taskId: '',
        url: '',
        error: `Unknown task provider: ${request.provider}. Supported: linear, todoist, jira`,
      };
  }
}

/**
 * Check which task providers are configured.
 */
export function getAvailableProviders(): TaskProvider[] {
  const config = getConfig();
  const providers: TaskProvider[] = [];

  if (config.linearApiKey) providers.push('linear');
  if (config.todoistApiToken) providers.push('todoist');
  if (config.jiraDomain && config.jiraEmail && config.jiraApiToken) providers.push('jira');

  return providers;
}
