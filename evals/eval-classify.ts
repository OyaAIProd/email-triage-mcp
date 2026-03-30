import { classifyEmail } from '../src/services/classifier.js';
import type { EmailMessage, EmailCategory } from '../src/types.js';

interface TestCase {
  name: string;
  email: EmailMessage;
  expectedCategory: EmailCategory;
}

function makeEmail(overrides: Partial<EmailMessage>): EmailMessage {
  return {
    id: 'test-' + Math.random().toString(36).slice(2),
    threadId: 'thread-1',
    from: 'sender@example.com',
    to: ['recipient@example.com'],
    cc: [],
    subject: '',
    body: '',
    htmlBody: '',
    date: new Date(),
    labels: ['INBOX', 'UNREAD'],
    snippet: '',
    isRead: false,
    hasAttachments: false,
    headers: {},
    ...overrides,
  };
}

const testCases: TestCase[] = [
  {
    name: 'Newsletter with List-Unsubscribe header',
    email: makeEmail({
      from: 'newsletter@techcrunch.com',
      subject: 'TechCrunch Weekly Digest: Top Stories',
      body: 'This week in tech... View in browser. To unsubscribe, click here.',
      headers: { 'list-unsubscribe': '<mailto:unsubscribe@techcrunch.com>' },
    }),
    expectedCategory: 'newsletter',
  },
  {
    name: 'Newsletter from noreply address',
    email: makeEmail({
      from: 'noreply@producthunt.com',
      subject: 'Product Hunt Daily Digest',
      body: 'Today\'s top products... Unsubscribe from these emails.',
      headers: { 'list-unsubscribe': '<https://producthunt.com/unsubscribe>' },
    }),
    expectedCategory: 'newsletter',
  },
  {
    name: 'Meeting request with calendar invite',
    email: makeEmail({
      from: 'alice@company.com',
      subject: 'Meeting: Q4 Planning Session',
      body: 'Hi, please join us for Q4 planning. Zoom link: https://zoom.us/j/123456. See attached calendar invite.',
      headers: { 'content-type': 'multipart/mixed; text/calendar' },
    }),
    expectedCategory: 'meeting_request',
  },
  {
    name: 'Sales pitch from unknown sender',
    email: makeEmail({
      from: 'John Smith, VP Sales <john@saascompany.io>',
      subject: 'Boost your team productivity by 300%',
      body: 'Hi, I noticed your company is growing fast. I\'d love to schedule a demo of our platform. We help companies like yours increase revenue with our AI-powered solution. Free trial available!',
    }),
    expectedCategory: 'sales_pitch',
  },
  {
    name: 'Support ticket notification',
    email: makeEmail({
      from: 'support@zendesk.com',
      subject: 'Ticket #4521: Cannot access dashboard',
      body: 'A new support ticket has been created. Issue: User reports they cannot access the analytics dashboard. Error message: 403 Forbidden. Ticket ID: 4521.',
    }),
    expectedCategory: 'support_ticket',
  },
  {
    name: 'Action required - review request',
    email: makeEmail({
      from: 'bob@company.com',
      subject: 'Action Required: Review Q3 Budget Proposal',
      body: 'Hi, could you please review the attached Q3 budget proposal and approve it by Friday? We need your sign-off before the deadline. This is urgent.',
      headers: { 'in-reply-to': '<prev-msg-id@company.com>' },
    }),
    expectedCategory: 'action_required',
  },
  {
    name: 'Personal message',
    email: makeEmail({
      from: 'friend@gmail.com',
      subject: 'Lunch tomorrow?',
      body: 'Hey! Want to grab lunch tomorrow? There\'s a new place downtown.',
      headers: {},
    }),
    expectedCategory: 'personal',
  },
  {
    name: 'FYI forwarded message',
    email: makeEmail({
      from: 'colleague@company.com',
      subject: 'Fwd: Company All-Hands Notes',
      body: 'FYI - sharing the all-hands notes from yesterday. Just for your awareness, no action needed.',
      cc: ['team1@company.com', 'team2@company.com', 'team3@company.com'],
    }),
    expectedCategory: 'fyi',
  },
  {
    name: 'Meeting with Calendly link',
    email: makeEmail({
      from: 'partner@agency.com',
      subject: 'Let\'s schedule a sync',
      body: 'Hi, I\'d like to book a time to discuss the project. Here\'s my Calendly: https://calendly.com/partner/30min. When are you available for a call this week?',
    }),
    expectedCategory: 'meeting_request',
  },
  {
    name: 'Action required with PR review',
    email: makeEmail({
      from: 'github@notifications.github.com',
      subject: 'Review requested: Fix authentication bug #342',
      body: 'Your review is requested on this pull request. Please review and approve the changes. The PR fixes a critical auth bug that needs to ship by end of day.',
      headers: { 'in-reply-to': '<github-pr@notifications.github.com>' },
    }),
    expectedCategory: 'action_required',
  },
];

export function runClassifyEvals(): { passed: number; failed: number; results: Array<{ name: string; passed: boolean; expected: string; got: string; confidence: number }> } {
  const results: Array<{ name: string; passed: boolean; expected: string; got: string; confidence: number }> = [];
  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const result = classifyEmail(tc.email);
    const pass = result.category === tc.expectedCategory;

    if (pass) {
      passed++;
    } else {
      failed++;
    }

    results.push({
      name: tc.name,
      passed: pass,
      expected: tc.expectedCategory,
      got: result.category,
      confidence: result.confidence,
    });
  }

  return { passed, failed, results };
}
