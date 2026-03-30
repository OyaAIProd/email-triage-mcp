import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getMessage } from '../services/gmail.js';
import { extractActionItems } from '../services/classifier.js';
import { recordToolUsage } from '../lib/usage.js';

export function registerExtractActions(server: McpServer): void {
  server.tool(
    'extract_action_items',
    'Extract action items and deadlines from an email. Returns structured list of tasks with priorities.',
    {
      email_id: z.string().describe('Gmail message ID to extract actions from'),
    },
    async ({ email_id }) => {
      const email = await getMessage(email_id);
      const items = extractActionItems(email);

      recordToolUsage('extract_action_items');

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              email_id: email.id,
              from: email.from,
              subject: email.subject,
              action_items: items,
              count: items.length,
            }, null, 2),
          },
        ],
      };
    }
  );
}
