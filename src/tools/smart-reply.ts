import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getMessage } from '../services/gmail.js';
import { classifyEmail, extractActionItems } from '../services/classifier.js';
import { requirePro } from '../lib/license.js';
import { recordToolUsage } from '../lib/usage.js';
import { extractDisplayName } from '../services/email-parser.js';
import type { ReplyTone, SmartReplyResult } from '../types.js';

export function registerSmartReply(server: McpServer): void {
  server.tool(
    'smart_reply',
    '[Pro] Generate a draft reply based on email context and classification. Produces a structured reply you can review and send.',
    {
      email_id: z.string().describe('Gmail message ID to reply to'),
      tone: z.enum(['professional', 'casual', 'brief', 'detailed']).optional().default('professional').describe('Reply tone'),
      intent: z.string().optional().describe('What you want to say (e.g., "accept the meeting", "decline politely", "ask for more info")'),
      include_action_items: z.boolean().optional().default(true).describe('Reference extracted action items in reply'),
    },
    async ({ email_id, tone, intent, include_action_items }) => {
      await requirePro();

      const email = await getMessage(email_id);
      const classification = classifyEmail(email);
      const actionItems = include_action_items ? extractActionItems(email) : [];
      const senderName = extractDisplayName(email.from);

      // Generate reply based on classification and intent
      const reply = generateReply({
        senderName,
        subject: email.subject,
        category: classification.category,
        tone: tone as ReplyTone,
        intent: intent ?? null,
        actionItems,
        originalSnippet: email.body.slice(0, 500),
      });

      recordToolUsage('smart_reply');

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              email_id: email.id,
              replying_to: email.from,
              original_subject: email.subject,
              draft_reply: reply,
              note: 'This is a draft. Review and customize before sending.',
            }, null, 2),
          },
        ],
      };
    }
  );
}

interface ReplyContext {
  senderName: string;
  subject: string;
  category: string;
  tone: ReplyTone;
  intent: string | null;
  actionItems: Array<{ description: string; deadline: string | null }>;
  originalSnippet: string;
}

function generateReply(ctx: ReplyContext): SmartReplyResult {
  const greeting = getGreeting(ctx.senderName, ctx.tone);
  const closing = getClosing(ctx.tone);
  const bodyParts: string[] = [];
  const suggestedActions: string[] = [];

  // If user provided explicit intent, use that
  if (ctx.intent) {
    bodyParts.push(buildIntentResponse(ctx.intent, ctx.tone));
    suggestedActions.push('Review and personalize the reply');
  } else {
    // Auto-generate based on category
    switch (ctx.category) {
      case 'action_required':
        bodyParts.push(buildActionRequiredReply(ctx));
        suggestedActions.push('Confirm you can meet the deadline');
        suggestedActions.push('Add specific deliverables or questions');
        break;

      case 'meeting_request':
        bodyParts.push(buildMeetingReply(ctx));
        suggestedActions.push('Check your calendar for conflicts');
        suggestedActions.push('Suggest alternative times if needed');
        break;

      case 'support_ticket':
        bodyParts.push(buildSupportReply(ctx));
        suggestedActions.push('Add specific technical details or workarounds');
        break;

      case 'sales_pitch':
        bodyParts.push(buildSalesReply(ctx));
        suggestedActions.push('Consider if this is worth a conversation');
        break;

      case 'personal':
        bodyParts.push(buildPersonalReply(ctx));
        suggestedActions.push('Add personal touch or specifics');
        break;

      default:
        bodyParts.push(buildGenericReply(ctx));
        suggestedActions.push('Customize with specific details');
        break;
    }
  }

  // Add action items acknowledgment
  if (ctx.actionItems.length > 0) {
    bodyParts.push('');
    bodyParts.push("Here's my understanding of the action items:");
    for (const item of ctx.actionItems) {
      bodyParts.push(`- ${item.description}${item.deadline ? ` (by ${item.deadline})` : ''}`);
    }
    bodyParts.push('');
    bodyParts.push('Let me know if I missed anything.');
  }

  const subject = ctx.subject.startsWith('Re:') ? ctx.subject : `Re: ${ctx.subject}`;
  const body = `${greeting}\n\n${bodyParts.join('\n')}\n\n${closing}`;

  return {
    subject,
    body,
    tone: ctx.tone,
    suggestedActions,
  };
}

function getGreeting(name: string, tone: ReplyTone): string {
  switch (tone) {
    case 'casual':
      return `Hey ${name},`;
    case 'brief':
      return `${name} -`;
    case 'detailed':
      return `Dear ${name},`;
    default:
      return `Hi ${name},`;
  }
}

function getClosing(tone: ReplyTone): string {
  switch (tone) {
    case 'casual':
      return 'Cheers';
    case 'brief':
      return 'Thanks';
    case 'detailed':
      return 'Best regards';
    default:
      return 'Best';
  }
}

function buildIntentResponse(intent: string, tone: ReplyTone): string {
  // Transform user intent into a reply sentence
  const lower = intent.toLowerCase();

  if (/accept|yes|confirm|approve/i.test(lower)) {
    return tone === 'brief'
      ? 'Sounds good, confirmed.'
      : 'Thanks for reaching out. I\'m happy to confirm this works for me.';
  }

  if (/decline|no|reject|pass/i.test(lower)) {
    return tone === 'brief'
      ? "Unfortunately I'll have to pass on this one."
      : "Thank you for thinking of me. Unfortunately, I won't be able to move forward with this at this time.";
  }

  if (/more info|clarify|question/i.test(lower)) {
    return tone === 'brief'
      ? 'Could you provide more details on this?'
      : 'Thanks for sending this over. I have a few questions before I can move forward. Could you provide additional details?';
  }

  if (/later|delay|postpone/i.test(lower)) {
    return "Thanks for this. I'd like to revisit this at a later date. Can we circle back on this in a couple of weeks?";
  }

  // Fallback: use the intent as a starting point
  return intent;
}

function buildActionRequiredReply(ctx: ReplyContext): string {
  if (ctx.tone === 'brief') {
    return "Got it, I'll take care of this.";
  }
  return "Thanks for flagging this. I've noted the action items and will work on them. I'll follow up once I have an update.";
}

function buildMeetingReply(ctx: ReplyContext): string {
  if (ctx.tone === 'brief') {
    return 'The proposed time works for me. See you then.';
  }
  return "Thanks for the invite. The proposed time works for me. Looking forward to connecting. Please let me know if there's anything I should prepare in advance.";
}

function buildSupportReply(ctx: ReplyContext): string {
  if (ctx.tone === 'brief') {
    return "Thanks for the update. I'm tracking this.";
  }
  return "Thank you for the update on this. I appreciate you keeping me informed. Please let me know if there's any additional information needed from my end.";
}

function buildSalesReply(ctx: ReplyContext): string {
  if (ctx.tone === 'brief') {
    return "Thanks, but this isn't a priority for us right now.";
  }
  return "Thank you for reaching out. I appreciate the information, but this isn't something we're looking to pursue at the moment. I'll keep your details on file for future reference.";
}

function buildPersonalReply(ctx: ReplyContext): string {
  if (ctx.tone === 'brief') {
    return 'Thanks for the message!';
  }
  return 'Thanks for reaching out! Great to hear from you.';
}

function buildGenericReply(ctx: ReplyContext): string {
  if (ctx.tone === 'brief') {
    return 'Thanks for sending this over. Noted.';
  }
  return "Thank you for this. I've reviewed the message and will follow up if I have any questions.";
}
