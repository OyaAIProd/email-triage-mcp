import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getMessage, getOrCreateLabel, addLabels, archiveMessage, markAsRead } from '../services/gmail.js';
import { classifyEmail } from '../services/classifier.js';
import { requirePro } from '../lib/license.js';
import { recordToolUsage } from '../lib/usage.js';
import type { EmailCategory } from '../types.js';

const CATEGORY_LABEL_MAP: Record<EmailCategory, string> = {
  action_required: 'Triage/Action Required',
  fyi: 'Triage/FYI',
  meeting_request: 'Triage/Meeting',
  sales_pitch: 'Triage/Sales',
  support_ticket: 'Triage/Support',
  newsletter: 'Triage/Newsletter',
  personal: 'Triage/Personal',
};

export function registerAutoLabel(server: McpServer): void {
  server.tool(
    'auto_label',
    '[Pro] Automatically label and optionally archive processed emails based on classification. Creates Gmail labels under Triage/ prefix.',
    {
      email_id: z.string().describe('Gmail message ID to label'),
      archive: z.boolean().optional().default(false).describe('Archive the email after labeling'),
      mark_read: z.boolean().optional().default(false).describe('Mark the email as read after labeling'),
      custom_label: z.string().optional().describe('Additional custom label to apply'),
    },
    async ({ email_id, archive, mark_read, custom_label }) => {
      await requirePro();

      const email = await getMessage(email_id);
      const classification = classifyEmail(email);

      // Get or create the classification label
      const labelName = CATEGORY_LABEL_MAP[classification.category];
      const labelId = await getOrCreateLabel(labelName);

      const appliedLabels = [labelName];
      const labelIds = [labelId];

      // Apply custom label if provided
      if (custom_label) {
        const customLabelId = await getOrCreateLabel(custom_label);
        labelIds.push(customLabelId);
        appliedLabels.push(custom_label);
      }

      // Apply labels
      await addLabels(email_id, labelIds);

      // Archive if requested
      if (archive) {
        await archiveMessage(email_id);
      }

      // Mark read if requested
      if (mark_read) {
        await markAsRead(email_id);
      }

      recordToolUsage('auto_label');

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              email_id: email.id,
              subject: email.subject,
              classification: classification.category,
              confidence: classification.confidence,
              labels_applied: appliedLabels,
              archived: archive,
              marked_read: mark_read,
            }, null, 2),
          },
        ],
      };
    }
  );
}
