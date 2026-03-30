import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getUnreadMessages } from '../services/gmail.js';
import { classifyEmail, extractActionItems, getEmailPriority } from '../services/classifier.js';
import { recordToolUsage, checkClassificationQuota } from '../lib/usage.js';
import type { EmailDigestEntry } from '../types.js';

export function registerEmailDigest(server: McpServer): void {
  server.tool(
    'get_email_digest',
    'Get a daily digest of unread emails with priority ranking. Classifies and prioritizes all unread inbox emails.',
    {
      max_emails: z.number().optional().default(25).describe('Maximum emails to process (default 25)'),
    },
    async ({ max_emails }) => {
      // Check quota for classifications
      const quota = await checkClassificationQuota();

      const emails = await getUnreadMessages(max_emails);

      if (emails.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ message: 'No unread emails in inbox.', entries: [] }),
            },
          ],
        };
      }

      // Classify each email (respecting quota)
      const entries: EmailDigestEntry[] = [];
      let classificationCount = 0;

      for (const email of emails) {
        // Check if we can still classify
        if (quota.limit !== Infinity && classificationCount >= quota.remaining) {
          entries.push({
            emailId: email.id,
            from: email.from,
            subject: email.subject,
            category: 'fyi', // default when quota exceeded
            confidence: 0,
            priority: 'low',
            snippet: email.snippet,
            date: email.date.toISOString(),
            actionItems: [],
          });
          continue;
        }

        const classification = classifyEmail(email);
        const priority = getEmailPriority(email, classification);
        const actionItems = classification.category === 'action_required'
          ? extractActionItems(email)
          : [];

        classificationCount++;

        entries.push({
          emailId: email.id,
          from: email.from,
          subject: email.subject,
          category: classification.category,
          confidence: classification.confidence,
          priority,
          snippet: email.snippet,
          date: email.date.toISOString(),
          actionItems,
        });
      }

      // Sort by priority: high > medium > low
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      entries.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

      recordToolUsage('get_email_digest');

      const summary = {
        total: entries.length,
        high_priority: entries.filter((e) => e.priority === 'high').length,
        medium_priority: entries.filter((e) => e.priority === 'medium').length,
        low_priority: entries.filter((e) => e.priority === 'low').length,
        categories: entries.reduce((acc, e) => {
          acc[e.category] = (acc[e.category] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              digest: entries,
              summary,
              classifications_used: classificationCount,
              quota_remaining: quota.limit === Infinity ? 'unlimited' : quota.remaining - classificationCount,
            }, null, 2),
          },
        ],
      };
    }
  );
}
