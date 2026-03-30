#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Tool registrations
import { registerClassifyEmail } from './tools/classify-email.js';
import { registerExtractActions } from './tools/extract-actions.js';
import { registerEmailDigest } from './tools/email-digest.js';
import { registerSearchEmails } from './tools/search-emails.js';
import { registerCreateTask } from './tools/create-task.js';
import { registerAutoLabel } from './tools/auto-label.js';
import { registerBatchTriage } from './tools/batch-triage.js';
import { registerSmartReply } from './tools/smart-reply.js';
import { registerEmailAnalytics } from './tools/email-analytics.js';
import { registerFollowUpTracker } from './tools/follow-up-tracker.js';

// Auth helpers
import { isAuthenticated, getAuthUrl, exchangeCode } from './lib/auth.js';
import { getLicenseStatus } from './lib/license.js';
import { closeDb } from './lib/usage.js';

const server = new McpServer({
  name: '@truss-dev/email-triage-mcp',
  version: '1.0.0',
});

// ── Auth Tools ───────────────────────────────────────────────────────

server.tool(
  'check_auth_status',
  'Check Gmail authentication status and license tier.',
  {},
  async () => {
    const authenticated = isAuthenticated();
    const license = await getLicenseStatus();

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            gmail_authenticated: authenticated,
            ...(!authenticated
              ? {
                  setup_instructions:
                    'Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET env vars, then use authorize_gmail tool.',
                  oauth_setup_url: 'https://console.cloud.google.com/apis/credentials',
                }
              : {}),
            license: {
              tier: license.tier,
              valid: license.valid,
              expires_at: license.expiresAt,
            },
            ...(license.tier === 'free'
              ? {
                  upgrade_info: {
                    url: 'https://buy.stripe.com/28E00igAv4605cWfXL7wA06',
                    price: '$25/mo',
                    features: [
                      'Unlimited classifications',
                      'Auto-labeling',
                      'Batch triage',
                      'Smart replies',
                      'Task creation (Linear, Jira, Todoist)',
                      'Email analytics',
                      'Follow-up tracking',
                    ],
                  },
                }
              : {}),
          }, null, 2),
        },
      ],
    };
  }
);

server.tool(
  'authorize_gmail',
  'Authorize Gmail access. Run without a code to get the authorization URL, or provide the code from the OAuth flow to complete authorization.',
  {
    code: z.string().optional().describe('OAuth authorization code from the consent screen'),
  },
  async ({ code }) => {
    if (!code) {
      // Step 1: Generate auth URL
      try {
        const url = getAuthUrl();
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                step: 1,
                instructions: [
                  '1. Open this URL in your browser:',
                  url,
                  '2. Sign in with your Google account and grant access.',
                  '3. Copy the authorization code.',
                  '4. Run authorize_gmail again with the code.',
                ],
                auth_url: url,
              }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              }),
            },
          ],
        };
      }
    }

    // Step 2: Exchange code for tokens
    try {
      await exchangeCode(code);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              step: 2,
              success: true,
              message: 'Gmail authorized successfully. You can now use all email tools.',
            }, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: `Failed to exchange code: ${err instanceof Error ? err.message : String(err)}`,
              tip: 'Make sure you copied the full authorization code. Try the flow again.',
            }),
          },
        ],
      };
    }
  }
);

// ── Register All Tools ───────────────────────────────────────────────

// Free tier
registerClassifyEmail(server);
registerExtractActions(server);
registerEmailDigest(server);
registerSearchEmails(server);

// Pro tier
registerCreateTask(server);
registerAutoLabel(server);
registerBatchTriage(server);
registerSmartReply(server);
registerEmailAnalytics(server);
registerFollowUpTracker(server);

// ── Start Server ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();

  // Clean shutdown
  process.on('SIGINT', () => {
    closeDb();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    closeDb();
    process.exit(0);
  });

  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal error starting MCP server:', err);
  closeDb();
  process.exit(1);
});
