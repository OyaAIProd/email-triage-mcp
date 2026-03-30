import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { searchEmails } from '../services/gmail.js';
import { recordToolUsage } from '../lib/usage.js';
import type { SearchResult } from '../types.js';

export function registerSearchEmails(server: McpServer): void {
  server.tool(
    'search_emails',
    'Search across emails using Gmail search syntax. Supports from:, to:, subject:, has:attachment, before:, after:, and free-text queries.',
    {
      query: z.string().describe('Gmail search query (e.g., "from:alice subject:report", "has:attachment invoice")'),
      max_results: z.number().optional().default(10).describe('Maximum results to return (default 10)'),
    },
    async ({ query, max_results }) => {
      const emails = await searchEmails(query, max_results);

      recordToolUsage('search_emails');

      const results: SearchResult[] = emails.map((email, index) => ({
        emailId: email.id,
        from: email.from,
        subject: email.subject,
        snippet: email.snippet || email.body.slice(0, 200),
        date: email.date.toISOString(),
        relevanceScore: 1 - index * 0.05, // Gmail returns in relevance order
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              query,
              results,
              count: results.length,
              tip: 'Use email_id with classify_email or extract_action_items for deeper analysis.',
            }, null, 2),
          },
        ],
      };
    }
  );
}
