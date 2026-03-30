import { extractActionItems } from '../src/services/classifier.js';
import type { EmailMessage } from '../src/types.js';

interface ExtractTestCase {
  name: string;
  email: EmailMessage;
  minExpectedItems: number;
  mustContain: string[]; // substrings that must appear in at least one action item description
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

const testCases: ExtractTestCase[] = [
  {
    name: 'Explicit action requests with deadline',
    email: makeEmail({
      subject: 'Q3 Report Review',
      body: `Hi team,

Please review the Q3 report and submit your feedback by Friday.
Could you also update the financial projections in the spreadsheet?

The board meeting is on Monday, so this is urgent.

Thanks,
Alice`,
    }),
    minExpectedItems: 1,
    mustContain: ['review'],
  },
  {
    name: 'Bullet-point task list',
    email: makeEmail({
      subject: 'Sprint Planning Action Items',
      body: `Here are the action items from today's sprint planning:

- Update the API documentation for v2 endpoints
- Fix the authentication bug reported in ticket #234
- Schedule a design review for the new dashboard
- Deploy the staging environment by Wednesday

Let me know if you have questions.`,
    }),
    minExpectedItems: 3,
    mustContain: ['API', 'authentication', 'dashboard'],
  },
  {
    name: 'Deadline extraction',
    email: makeEmail({
      subject: 'Contract Renewal',
      body: `Hi,

Please sign the contract renewal and return it by March 15, 2026.
Don't forget to review the new terms in section 4.

Thanks,
Legal Team`,
    }),
    minExpectedItems: 1,
    mustContain: ['contract', 'sign'],
  },
  {
    name: 'Mixed content with implicit actions',
    email: makeEmail({
      subject: 'Project Update',
      body: `Team,

Great progress this week. A few things:

Could you send me the updated wireframes by end of day?
Please make sure the CI pipeline is green before the release.
Remember to update your time tracking for this sprint.

Next steps:
- Finalize the migration plan for the database upgrade
- Review and approve the security audit findings

Best,
PM`,
    }),
    minExpectedItems: 3,
    mustContain: ['wireframe', 'migration'],
  },
  {
    name: 'Email with no action items',
    email: makeEmail({
      subject: 'FYI: Team Offsite Photos',
      body: `Hi everyone,

Just sharing the photos from last week's team offsite. They turned out great!

Have a wonderful weekend.

Cheers,
Sarah`,
    }),
    minExpectedItems: 0,
    mustContain: [],
  },
];

export function runExtractEvals(): { passed: number; failed: number; results: Array<{ name: string; passed: boolean; details: string }> } {
  const results: Array<{ name: string; passed: boolean; details: string }> = [];
  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const items = extractActionItems(tc.email);

    // Check minimum items
    const hasMinItems = items.length >= tc.minExpectedItems;

    // Check required substrings
    const missingSubstrings: string[] = [];
    for (const sub of tc.mustContain) {
      const found = items.some((item) =>
        item.description.toLowerCase().includes(sub.toLowerCase())
      );
      if (!found) {
        missingSubstrings.push(sub);
      }
    }

    const pass = hasMinItems && missingSubstrings.length === 0;

    if (pass) {
      passed++;
    } else {
      failed++;
    }

    const details = [
      `Found ${items.length} items (expected >= ${tc.minExpectedItems})`,
      ...(missingSubstrings.length > 0
        ? [`Missing keywords: ${missingSubstrings.join(', ')}`]
        : []),
      ...(items.length > 0
        ? [`Items: ${items.map((i) => `"${i.description.slice(0, 60)}..."`).join(', ')}`]
        : []),
    ].join('. ');

    results.push({
      name: tc.name,
      passed: pass,
      details,
    });
  }

  return { passed, failed, results };
}
