import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getUnreadMessages, getOrCreateLabel, addLabels, archiveMessage, markAsRead } from '../services/gmail.js';
import { classifyEmail, extractActionItems, getEmailPriority } from '../services/classifier.js';
import { createTask, getAvailableProviders } from '../services/task-integrations.js';
import { requirePro } from '../lib/license.js';
import { recordToolUsage, logEmailAnalytics } from '../lib/usage.js';
import type { EmailCategory, TaskProvider, BatchTriageResult } from '../types.js';

const CATEGORY_LABEL_MAP: Record<EmailCategory, string> = {
  action_required: 'Triage/Action Required',
  fyi: 'Triage/FYI',
  meeting_request: 'Triage/Meeting',
  sales_pitch: 'Triage/Sales',
  support_ticket: 'Triage/Support',
  newsletter: 'Triage/Newsletter',
  personal: 'Triage/Personal',
};

export function registerBatchTriage(server: McpServer): void {
  server.tool(
    'batch_triage',
    '[Pro] Process all unread emails at once: classify, label, extract tasks, and optionally create tasks in external tools. The power move.',
    {
      max_emails: z.number().optional().default(50).describe('Maximum emails to process (default 50)'),
      auto_label: z.boolean().optional().default(true).describe('Apply classification labels'),
      archive_newsletters: z.boolean().optional().default(false).describe('Auto-archive newsletters'),
      archive_sales: z.boolean().optional().default(false).describe('Auto-archive sales pitches'),
      create_tasks_for_actions: z.boolean().optional().default(false).describe('Create tasks for action_required emails'),
      task_provider: z.enum(['linear', 'todoist', 'jira']).optional().describe('Task provider for auto-creation'),
    },
    async ({ max_emails, auto_label, archive_newsletters, archive_sales, create_tasks_for_actions, task_provider }) => {
      await requirePro();

      const emails = await getUnreadMessages(max_emails);

      if (emails.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                message: 'No unread emails to triage.',
                totalProcessed: 0,
              }),
            },
          ],
        };
      }

      const result: BatchTriageResult = {
        totalProcessed: emails.length,
        classifications: [],
        summary: {
          actionRequired: 0,
          fyi: 0,
          meetingRequests: 0,
          newsletters: 0,
          other: 0,
        },
      };

      // Check available providers
      const availableProviders = getAvailableProviders();
      const canCreateTasks = create_tasks_for_actions && task_provider && availableProviders.includes(task_provider);

      // Label cache to avoid creating the same label repeatedly
      const labelCache = new Map<string, string>();

      for (const email of emails) {
        const classification = classifyEmail(email);
        const priority = getEmailPriority(email, classification);
        const actionItems = classification.category === 'action_required'
          ? extractActionItems(email)
          : [];

        // Log analytics
        logEmailAnalytics(email.id, email.from, classification.category, email.date.getUTCHours(), null);

        // Apply labels
        const labelsApplied: string[] = [];
        if (auto_label) {
          const labelName = CATEGORY_LABEL_MAP[classification.category];

          let labelId = labelCache.get(labelName);
          if (!labelId) {
            labelId = await getOrCreateLabel(labelName);
            labelCache.set(labelName, labelId);
          }

          await addLabels(email.id, [labelId]);
          labelsApplied.push(labelName);
        }

        // Archive newsletters/sales if requested
        if (archive_newsletters && classification.category === 'newsletter') {
          await archiveMessage(email.id);
          await markAsRead(email.id);
        }
        if (archive_sales && classification.category === 'sales_pitch') {
          await archiveMessage(email.id);
          await markAsRead(email.id);
        }

        // Create task for action items
        let taskResult = null;
        if (canCreateTasks && classification.category === 'action_required' && actionItems.length > 0) {
          taskResult = await createTask({
            title: `[Email] ${email.subject}`,
            description: [
              `From: ${email.from}`,
              `Date: ${email.date.toISOString()}`,
              '',
              ...actionItems.map((a) => `- ${a.description}${a.deadline ? ` (due: ${a.deadline})` : ''}`),
            ].join('\n'),
            priority: priority === 'high' ? 'high' : 'medium',
            provider: task_provider as TaskProvider,
          });
        }

        result.classifications.push({
          emailId: email.id,
          from: email.from,
          subject: email.subject,
          category: classification.category,
          confidence: classification.confidence,
          actionItems,
          labelsApplied,
          taskCreated: taskResult,
        });

        // Update summary
        switch (classification.category) {
          case 'action_required':
            result.summary.actionRequired++;
            break;
          case 'fyi':
            result.summary.fyi++;
            break;
          case 'meeting_request':
            result.summary.meetingRequests++;
            break;
          case 'newsletter':
            result.summary.newsletters++;
            break;
          default:
            result.summary.other++;
            break;
        }
      }

      recordToolUsage('batch_triage');

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}
