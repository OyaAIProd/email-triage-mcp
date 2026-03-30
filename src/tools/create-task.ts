import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getMessage } from '../services/gmail.js';
import { extractActionItems } from '../services/classifier.js';
import { createTask, getAvailableProviders } from '../services/task-integrations.js';
import { requirePro } from '../lib/license.js';
import { recordToolUsage } from '../lib/usage.js';
import type { TaskProvider } from '../types.js';

export function registerCreateTask(server: McpServer): void {
  server.tool(
    'create_task',
    '[Pro] Auto-create tasks in Linear, Jira, or Todoist from email content. Extracts action items and creates external tasks.',
    {
      email_id: z.string().describe('Gmail message ID to create task from'),
      provider: z.enum(['linear', 'todoist', 'jira']).describe('Task management platform'),
      custom_title: z.string().optional().describe('Override auto-generated task title'),
      custom_description: z.string().optional().describe('Override auto-generated description'),
      priority: z.enum(['urgent', 'high', 'medium', 'low']).optional().default('medium').describe('Task priority'),
      due_date: z.string().optional().describe('Due date in YYYY-MM-DD format'),
    },
    async ({ email_id, provider, custom_title, custom_description, priority, due_date }) => {
      await requirePro();

      const email = await getMessage(email_id);
      const actionItems = extractActionItems(email);

      // Build task content from email
      const title = custom_title ?? `[Email] ${email.subject}`;
      const descriptionParts = [
        `**From:** ${email.from}`,
        `**Date:** ${email.date.toISOString()}`,
        '',
        custom_description ?? email.body.slice(0, 1000),
      ];

      if (actionItems.length > 0) {
        descriptionParts.push('', '**Action Items:**');
        for (const item of actionItems) {
          descriptionParts.push(`- ${item.description}${item.deadline ? ` (due: ${item.deadline})` : ''}`);
        }
      }

      const result = await createTask({
        title,
        description: descriptionParts.join('\n'),
        priority,
        dueDate: due_date,
        provider: provider as TaskProvider,
      });

      recordToolUsage('create_task');

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ...result,
              email_subject: email.subject,
              email_from: email.from,
              action_items_found: actionItems.length,
            }, null, 2),
          },
        ],
      };
    }
  );
}
