import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSentMessages, searchEmails } from '../services/gmail.js';
import { extractEmailAddress } from '../services/email-parser.js';
import { requirePro } from '../lib/license.js';
import { recordToolUsage, addFollowUp, getActiveFollowUps, updateFollowUpStatus } from '../lib/usage.js';
import type { FollowUpEntry } from '../types.js';

export function registerFollowUpTracker(server: McpServer): void {
  server.tool(
    'follow_up_tracker',
    '[Pro] Track emails awaiting responses. Scans sent emails and checks if recipients have replied. Surfaces stale threads.',
    {
      action: z.enum(['scan', 'list', 'mark_resolved']).describe(
        'scan: Check sent emails for missing replies. list: Show all tracked follow-ups. mark_resolved: Mark a follow-up as resolved.'
      ),
      email_id: z.string().optional().describe('Email ID to mark as resolved (required for mark_resolved action)'),
      days_back: z.number().optional().default(7).describe('How many days back to scan sent emails (for scan action)'),
      overdue_threshold_days: z.number().optional().default(3).describe('Days without reply before marking as overdue'),
    },
    async ({ action, email_id, days_back, overdue_threshold_days }) => {
      await requirePro();

      recordToolUsage('follow_up_tracker');

      switch (action) {
        case 'scan':
          return await handleScan(days_back, overdue_threshold_days);
        case 'list':
          return handleList(overdue_threshold_days);
        case 'mark_resolved':
          return handleMarkResolved(email_id);
      }
    }
  );
}

async function handleScan(
  daysBack: number,
  overdueThreshold: number
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // Get sent messages from the last N days
  const afterDate = new Date();
  afterDate.setDate(afterDate.getDate() - daysBack);
  const afterStr = `${afterDate.getFullYear()}/${afterDate.getMonth() + 1}/${afterDate.getDate()}`;

  const sentEmails = await getSentMessages(50);
  const now = new Date();

  let newFollowUps = 0;
  let alreadyReplied = 0;

  for (const sent of sentEmails) {
    // Skip if older than our scan window
    if (sent.date < afterDate) continue;

    // Check if there's a reply in the same thread
    const recipientEmail = sent.to.length > 0 ? extractEmailAddress(sent.to[0]) : '';
    if (!recipientEmail) continue;

    // Search for replies from the recipient
    const replies = await searchEmails(
      `from:${recipientEmail} subject:"${sent.subject.replace(/^Re:\s*/i, '')}"`,
      5
    );

    const hasReply = replies.some((r) => r.date > sent.date);

    if (hasReply) {
      alreadyReplied++;
      updateFollowUpStatus(sent.id, 'responded');
    } else {
      // Track as needing follow-up
      addFollowUp(sent.id, recipientEmail, sent.subject, sent.date.toISOString());
      newFollowUps++;
    }
  }

  // Get current follow-ups
  const followUps = getActiveFollowUps();
  const entries = formatFollowUps(followUps, overdueThreshold);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          scanned_sent_emails: sentEmails.length,
          new_follow_ups_tracked: newFollowUps,
          already_replied: alreadyReplied,
          active_follow_ups: entries,
          summary: {
            total_awaiting: entries.filter((e) => e.status === 'awaiting_response').length,
            overdue: entries.filter((e) => e.status === 'overdue').length,
          },
        }, null, 2),
      },
    ],
  };
}

function handleList(
  overdueThreshold: number
): { content: Array<{ type: 'text'; text: string }> } {
  const followUps = getActiveFollowUps();
  const entries = formatFollowUps(followUps, overdueThreshold);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          active_follow_ups: entries,
          total: entries.length,
          overdue: entries.filter((e) => e.status === 'overdue').length,
          tip: 'Use action: "mark_resolved" with the email_id to clear resolved follow-ups.',
        }, null, 2),
      },
    ],
  };
}

function handleMarkResolved(
  emailId: string | undefined
): { content: Array<{ type: 'text'; text: string }> } {
  if (!emailId) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            error: 'email_id is required for mark_resolved action.',
          }),
        },
      ],
    };
  }

  updateFollowUpStatus(emailId, 'responded');

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          email_id: emailId,
          new_status: 'responded',
        }),
      },
    ],
  };
}

function formatFollowUps(
  followUps: Array<{ email_id: string; from_addr: string; subject: string; sent_date: string; status: string }>,
  overdueThreshold: number
): FollowUpEntry[] {
  const now = new Date();

  return followUps.map((fu) => {
    const sentDate = new Date(fu.sent_date);
    const daysSince = Math.floor((now.getTime() - sentDate.getTime()) / (1000 * 60 * 60 * 24));
    const status = daysSince >= overdueThreshold ? 'overdue' : 'awaiting_response';

    return {
      emailId: fu.email_id,
      from: fu.from_addr,
      subject: fu.subject,
      sentDate: fu.sent_date,
      daysSinceSent: daysSince,
      status: status as FollowUpEntry['status'],
    };
  });
}
