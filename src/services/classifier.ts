import type { EmailMessage, EmailCategory, ClassificationResult, ActionItem } from '../types.js';
import { extractEmailAddress } from './email-parser.js';

// ── Category scoring rules ───────────────────────────────────────────

interface ScoringRule {
  weight: number;
  test: (email: EmailMessage) => boolean;
}

const CATEGORY_RULES: Record<EmailCategory, ScoringRule[]> = {
  newsletter: [
    { weight: 0.9, test: (e) => !!e.headers['list-unsubscribe'] },
    { weight: 0.7, test: (e) => /unsubscribe/i.test(e.body) },
    { weight: 0.5, test: (e) => /\b(newsletter|digest|weekly|monthly roundup|this week in)\b/i.test(e.subject) },
    { weight: 0.4, test: (e) => /\b(noreply|no-reply|newsletter|mailer|updates)\b/i.test(extractEmailAddress(e.from)) },
    { weight: 0.3, test: (e) => /\b(view in browser|view online|email preferences)\b/i.test(e.body) },
    { weight: 0.2, test: (e) => e.to.length === 0 || /undisclosed/i.test(e.to.join(' ')) },
  ],

  meeting_request: [
    { weight: 0.9, test: (e) => /text\/calendar/i.test(e.headers['content-type'] ?? '') },
    { weight: 0.8, test: (e) => /\b(calendar invite|meeting invite|invitation)\b/i.test(e.subject) },
    { weight: 0.7, test: (e) => /\b(invite\.ics|\.ics)\b/i.test(e.body) },
    { weight: 0.7, test: (e) => /\b(zoom\.us|meet\.google|teams\.microsoft|calendly)\b/i.test(e.body) },
    { weight: 0.6, test: (e) => /\b(schedule|meeting|call|sync|standup|1:1|one-on-one)\b/i.test(e.subject) },
    { weight: 0.5, test: (e) => /\b(schedule|book a time|let'?s? (schedule|sync|connect|chat)|available.*call)\b/i.test(e.body) },
    { weight: 0.4, test: (e) => /\b(available|free at|slot|book a time|when works|when are you)\b/i.test(e.body) },
    { weight: 0.3, test: (e) => /\b(rsvp|accept|decline|tentative)\b/i.test(e.body) },
  ],

  sales_pitch: [
    { weight: 0.7, test: (e) => /\b(demo|trial|pricing|roi|revenue|growth)\b/i.test(e.subject) },
    { weight: 0.6, test: (e) => /\b(schedule a demo|book a call|free trial|limited time|exclusive offer)\b/i.test(e.body) },
    { weight: 0.5, test: (e) => /\b(reaching out|following up|touch base|quick question)\b/i.test(e.body) && !e.headers['in-reply-to'] },
    { weight: 0.5, test: (e) => /\b(increase|boost|scale|grow|accelerate|transform)\b/i.test(e.subject) && /\b(your|business|team|company)\b/i.test(e.subject) },
    { weight: 0.4, test: (e) => /\b(save \d+%|discount|promo|coupon|offer expires)\b/i.test(e.body) },
    { weight: 0.4, test: (e) => /\b(I noticed|I saw|I came across|saw your)\b/i.test(e.body) && !e.headers['in-reply-to'] },
    { weight: 0.3, test: (e) => /\b(unsubscribe|opt.out|email preferences)\b/i.test(e.body) && !e.headers['list-unsubscribe'] },
    { weight: 0.3, test: (e) => /\b(CEO|CTO|VP|Director|Head of|founder)\b/i.test(e.from) && !e.headers['in-reply-to'] },
  ],

  support_ticket: [
    { weight: 0.8, test: (e) => /\b(ticket|case)\s*#?\d+/i.test(e.subject) },
    { weight: 0.7, test: (e) => /\b(support|helpdesk|help desk|customer service)\b/i.test(extractEmailAddress(e.from)) },
    { weight: 0.6, test: (e) => /\b(issue|bug|error|problem|broken|not working|can't|cannot)\b/i.test(e.subject) },
    { weight: 0.5, test: (e) => /\b(ticket|incident|case|request)\s*(id|number|#)/i.test(e.body) },
    { weight: 0.4, test: (e) => /\b(resolved|closed|reopened|escalated|assigned)\b/i.test(e.subject) },
    { weight: 0.3, test: (e) => /\b(jira|zendesk|freshdesk|intercom|servicenow)\b/i.test(extractEmailAddress(e.from)) },
  ],

  action_required: [
    { weight: 0.8, test: (e) => /\b(action required|action needed|urgent|asap|immediately)\b/i.test(e.subject) },
    { weight: 0.7, test: (e) => /\b(please|kindly|could you|can you|would you)\b/i.test(e.body) && /\b(review|approve|sign|submit|complete|update|send|provide|confirm)\b/i.test(e.body) },
    { weight: 0.6, test: (e) => /\b(deadline|due date|by (monday|tuesday|wednesday|thursday|friday|tomorrow|end of|eod|eow|cop))\b/i.test(e.body) },
    { weight: 0.5, test: (e) => /\b(assigned to you|your review|your approval|your input|your feedback)\b/i.test(e.body) },
    { weight: 0.4, test: (e) => /\?/.test(e.subject) && !!e.headers['in-reply-to'] },
    { weight: 0.3, test: (e) => /\b(pr|pull request|merge request|review)\b/i.test(e.subject) && /\b(review|approve)\b/i.test(e.body) },
    { weight: 0.3, test: (e) => /\b(todo|to-do|task|follow.?up)\b/i.test(e.subject) },
  ],

  personal: [
    { weight: 0.6, test: (e) => /\b(hey|hi|hello|yo|sup)\b/i.test(e.body.slice(0, 50)) && e.body.length < 500 },
    { weight: 0.5, test: (e) => !!e.headers['in-reply-to'] && e.body.length < 300 },
    { weight: 0.4, test: (e) => /\b(lunch|dinner|coffee|drinks|weekend|birthday|party|congrats|congratulations)\b/i.test(e.body) },
    { weight: 0.4, test: (e) => e.to.length === 1 && e.cc.length === 0 && !e.headers['list-unsubscribe'] },
    { weight: 0.3, test: (e) => /\b(gmail\.com|yahoo\.com|hotmail\.com|outlook\.com|icloud\.com|proton\.me)\b/i.test(extractEmailAddress(e.from)) },
    { weight: 0.3, test: (e) => /\b(thanks|thank you|cheers|best|regards)\b/i.test(e.body) && e.body.length < 200 },
  ],

  fyi: [
    { weight: 0.6, test: (e) => /\b(fyi|for your (information|reference|review|awareness))\b/i.test(e.subject) },
    { weight: 0.5, test: (e) => /^(fwd?|fw):/i.test(e.subject) },
    { weight: 0.4, test: (e) => /\b(sharing|heads.?up|letting you know|just wanted to share|fyi)\b/i.test(e.body.slice(0, 200)) },
    { weight: 0.4, test: (e) => /\b(announcement|update|notice|notification|alert)\b/i.test(e.subject) && !e.headers['list-unsubscribe'] },
    { weight: 0.3, test: (e) => e.cc.length > 2 }, // mass CC = probably FYI
    { weight: 0.2, test: (e) => !!e.headers['in-reply-to'] && !/\?/.test(e.body) },
  ],
};

/**
 * Classify an email using rule-based pattern matching.
 * No external LLM API needed.
 */
export function classifyEmail(email: EmailMessage): ClassificationResult {
  const scores: Record<EmailCategory, number> = {
    action_required: 0,
    fyi: 0,
    meeting_request: 0,
    sales_pitch: 0,
    support_ticket: 0,
    newsletter: 0,
    personal: 0,
  };

  const matchedRules: Record<EmailCategory, number> = {
    action_required: 0,
    fyi: 0,
    meeting_request: 0,
    sales_pitch: 0,
    support_ticket: 0,
    newsletter: 0,
    personal: 0,
  };

  // Score each category
  for (const [category, rules] of Object.entries(CATEGORY_RULES) as Array<[EmailCategory, ScoringRule[]]>) {
    let totalWeight = 0;
    let matchedWeight = 0;

    for (const rule of rules) {
      totalWeight += rule.weight;
      try {
        if (rule.test(email)) {
          matchedWeight += rule.weight;
          matchedRules[category]++;
        }
      } catch {
        // ignore rule errors
      }
    }

    // Normalize score 0-1
    scores[category] = totalWeight > 0 ? matchedWeight / totalWeight : 0;
  }

  // Find top category
  let topCategory: EmailCategory = 'fyi';
  let topScore = 0;

  for (const [category, score] of Object.entries(scores) as Array<[EmailCategory, number]>) {
    if (score > topScore) {
      topScore = score;
      topCategory = category;
    }
  }

  // If no strong signal, default to FYI
  if (topScore < 0.1) {
    topCategory = 'fyi';
    scores.fyi = Math.max(scores.fyi, 0.1);
  }

  // Generate reasoning
  const reasoning = generateReasoning(email, topCategory, matchedRules[topCategory]);

  return {
    category: topCategory,
    confidence: Math.round(topScore * 100) / 100,
    scores,
    reasoning,
  };
}

function generateReasoning(email: EmailMessage, category: EmailCategory, matchCount: number): string {
  const reasons: string[] = [];

  switch (category) {
    case 'newsletter':
      if (email.headers['list-unsubscribe']) reasons.push('has List-Unsubscribe header');
      if (/unsubscribe/i.test(email.body)) reasons.push('contains unsubscribe link');
      if (/noreply|no-reply/i.test(extractEmailAddress(email.from))) reasons.push('sent from no-reply address');
      break;
    case 'meeting_request':
      if (/calendar|\.ics/i.test(email.body)) reasons.push('contains calendar attachment');
      if (/zoom|meet\.google|teams/i.test(email.body)) reasons.push('contains meeting link');
      if (/schedule|meeting|call/i.test(email.subject)) reasons.push('subject indicates meeting');
      break;
    case 'sales_pitch':
      if (/demo|trial|pricing/i.test(email.subject)) reasons.push('subject contains sales keywords');
      if (!email.headers['in-reply-to']) reasons.push('unsolicited (no prior thread)');
      break;
    case 'support_ticket':
      if (/ticket|case/i.test(email.subject)) reasons.push('subject references ticket/case');
      if (/support|helpdesk/i.test(extractEmailAddress(email.from))) reasons.push('from support address');
      break;
    case 'action_required':
      if (/action required|urgent/i.test(email.subject)) reasons.push('subject flags urgency');
      if (/please.*review|approve|submit/i.test(email.body)) reasons.push('body requests specific action');
      if (/deadline|due date/i.test(email.body)) reasons.push('mentions deadline');
      break;
    case 'personal':
      if (email.body.length < 300) reasons.push('short message');
      if (email.to.length === 1 && email.cc.length === 0) reasons.push('direct 1:1 message');
      break;
    case 'fyi':
      if (/^(fwd?|fw):/i.test(email.subject)) reasons.push('forwarded message');
      if (/fyi|heads.?up/i.test(email.body.slice(0, 200))) reasons.push('body indicates informational');
      break;
  }

  if (reasons.length === 0) {
    return `Classified as ${category} based on ${matchCount} matching pattern(s).`;
  }

  return `Classified as ${category}: ${reasons.join('; ')}.`;
}

// ── Action Item Extraction ───────────────────────────────────────────

const DEADLINE_PATTERNS = [
  /\bby\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\bby\s+(tomorrow|end of day|eod|end of week|eow|cop|close of play)\b/i,
  /\bby\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/,
  /\bby\s+(\w+ \d{1,2}(?:,?\s*\d{4})?)\b/,
  /\bdue\s+(\w+ \d{1,2}(?:,?\s*\d{4})?)\b/,
  /\bdeadline[:\s]+(\w[\w\s,/]+)/i,
  /\bdue\s+(tomorrow|today|monday|tuesday|wednesday|thursday|friday)\b/i,
  /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\s+deadline\b/i,
];

const ACTION_PATTERNS = [
  /(?:please|kindly|could you|can you|would you|need you to)\s+(.{10,80}?)(?:\.|$)/gim,
  /(?:action required|todo|to-do|task)[\s:]+(.{10,80}?)(?:\.|$)/gim,
  /(?:^\s*[-*]\s+)(.{10,80}?)$/gim,
  /(?:next steps?|follow.?up)[\s:]+(.{10,80}?)(?:\.|$)/gim,
  /(?:don't forget|remember to|make sure)\s+(.{10,80}?)(?:\.|$)/gim,
];

export function extractActionItems(email: EmailMessage): ActionItem[] {
  const items: ActionItem[] = [];
  const seen = new Set<string>();
  const bodyText = email.body;

  // Extract deadline from email
  let globalDeadline: string | null = null;
  for (const pattern of DEADLINE_PATTERNS) {
    const match = bodyText.match(pattern);
    if (match?.[1]) {
      globalDeadline = match[1].trim();
      break;
    }
  }

  // Extract action items
  for (const pattern of ACTION_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(bodyText)) !== null) {
      const description = match[1].trim();

      // Skip duplicates and very short matches
      if (description.length < 10 || seen.has(description.toLowerCase())) continue;
      seen.add(description.toLowerCase());

      // Check for item-specific deadline
      let deadline = globalDeadline;
      for (const dp of DEADLINE_PATTERNS) {
        const dm = description.match(dp);
        if (dm?.[1]) {
          deadline = dm[1].trim();
          break;
        }
      }

      // Determine priority
      const priority = determinePriority(description, email.subject);

      // Try to extract assignee
      const assignee = extractAssignee(description);

      items.push({
        description,
        deadline,
        priority,
        assignee,
      });

      // Cap at 10 items
      if (items.length >= 10) break;
    }

    if (items.length >= 10) break;
  }

  return items;
}

function determinePriority(text: string, subject: string): 'high' | 'medium' | 'low' {
  const combined = `${subject} ${text}`.toLowerCase();

  if (/\b(urgent|asap|immediately|critical|blocker|p0|p1)\b/.test(combined)) {
    return 'high';
  }
  if (/\b(important|soon|this week|priority|eod|end of day)\b/.test(combined)) {
    return 'medium';
  }
  return 'low';
}

function extractAssignee(text: string): string | null {
  const match = text.match(/@(\w+)/);
  return match ? match[1] : null;
}

// ── Email Priority Scoring ───────────────────────────────────────────

export function getEmailPriority(
  email: EmailMessage,
  classification: ClassificationResult
): 'high' | 'medium' | 'low' {
  // Action required is always high
  if (classification.category === 'action_required' && classification.confidence > 0.5) {
    return 'high';
  }

  // Meeting requests are medium-high
  if (classification.category === 'meeting_request') {
    return 'medium';
  }

  // Support tickets depend on urgency keywords
  if (classification.category === 'support_ticket') {
    if (/\b(urgent|critical|down|outage|blocked)\b/i.test(email.subject)) return 'high';
    return 'medium';
  }

  // Newsletters and sales pitches are low
  if (classification.category === 'newsletter' || classification.category === 'sales_pitch') {
    return 'low';
  }

  // Personal emails are medium
  if (classification.category === 'personal') {
    return 'medium';
  }

  // FYI is low
  return 'low';
}
