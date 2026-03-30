import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getMessage } from '../services/gmail.js';
import { classifyEmail } from '../services/classifier.js';
import { recordToolUsage, checkClassificationQuota } from '../lib/usage.js';
import { logEmailAnalytics } from '../lib/usage.js';

export function registerClassifyEmail(server: McpServer): void {
  server.tool(
    'classify_email',
    'Classify an email by intent: action_required, fyi, meeting_request, sales_pitch, support_ticket, newsletter, personal. Free tier: 10 classifications/day.',
    {
      email_id: z.string().describe('Gmail message ID to classify'),
    },
    async ({ email_id }) => {
      // Check quota
      const quota = await checkClassificationQuota();
      if (!quota.allowed) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Free tier daily limit reached (10 classifications/day). Upgrade to Pro for unlimited.',
                upgrade_url: 'https://buy.stripe.com/28E00igAv4605cWfXL7wA06',
                remaining: 0,
                resets_at: 'midnight UTC',
              }),
            },
          ],
        };
      }

      // Fetch and classify
      const email = await getMessage(email_id);
      const result = classifyEmail(email);

      // Record usage
      recordToolUsage('classify_email');
      logEmailAnalytics(email.id, email.from, result.category, email.date.getUTCHours(), null);

      const remaining = quota.remaining - 1;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              email_id: email.id,
              from: email.from,
              subject: email.subject,
              classification: {
                category: result.category,
                confidence: result.confidence,
                reasoning: result.reasoning,
              },
              all_scores: result.scores,
              quota: {
                remaining,
                limit: quota.limit,
              },
            }, null, 2),
          },
        ],
      };
    }
  );
}
