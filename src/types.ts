// ── Email Types ──────────────────────────────────────────────────────

export type EmailCategory =
  | 'action_required'
  | 'fyi'
  | 'meeting_request'
  | 'sales_pitch'
  | 'support_ticket'
  | 'newsletter'
  | 'personal';

export interface EmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  htmlBody: string;
  date: Date;
  labels: string[];
  snippet: string;
  isRead: boolean;
  hasAttachments: boolean;
  headers: Record<string, string>;
}

export interface ClassificationResult {
  category: EmailCategory;
  confidence: number;
  scores: Record<EmailCategory, number>;
  reasoning: string;
}

export interface ActionItem {
  description: string;
  deadline: string | null;
  priority: 'high' | 'medium' | 'low';
  assignee: string | null;
}

export interface EmailDigestEntry {
  emailId: string;
  from: string;
  subject: string;
  category: EmailCategory;
  confidence: number;
  priority: 'high' | 'medium' | 'low';
  snippet: string;
  date: string;
  actionItems: ActionItem[];
}

export interface SearchResult {
  emailId: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  relevanceScore: number;
}

// ── Task Integration Types ───────────────────────────────────────────

export type TaskProvider = 'linear' | 'jira' | 'todoist';

export interface TaskCreationRequest {
  title: string;
  description: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  dueDate?: string;
  labels?: string[];
  provider: TaskProvider;
}

export interface TaskCreationResult {
  success: boolean;
  provider: TaskProvider;
  taskId: string;
  url: string;
  error?: string;
}

// ── Analytics Types ──────────────────────────────────────────────────

export interface EmailAnalytics {
  totalProcessed: number;
  categoryBreakdown: Record<EmailCategory, number>;
  topSenders: Array<{ sender: string; count: number; avgResponseTime: number | null }>;
  avgResponseTime: number | null;
  busiestHours: Array<{ hour: number; count: number }>;
  periodDays: number;
}

export interface FollowUpEntry {
  emailId: string;
  from: string;
  subject: string;
  sentDate: string;
  daysSinceSent: number;
  status: 'awaiting_response' | 'responded' | 'overdue';
}

// ── License Types ────────────────────────────────────────────────────

export type LicenseTier = 'free' | 'pro';

export interface LicenseStatus {
  tier: LicenseTier;
  valid: boolean;
  expiresAt: string | null;
  remainingClassifications: number | null; // null = unlimited
}

// ── Config Types ─────────────────────────────────────────────────────

export interface TrussConfig {
  gmailClientId?: string;
  gmailClientSecret?: string;
  licenseKey?: string;
  linearApiKey?: string;
  todoistApiToken?: string;
  jiraEmail?: string;
  jiraApiToken?: string;
  jiraDomain?: string;
  trussApiBaseUrl: string;
  dataDir: string;
}

// ── Smart Reply Types ────────────────────────────────────────────────

export type ReplyTone = 'professional' | 'casual' | 'brief' | 'detailed';

export interface SmartReplyResult {
  subject: string;
  body: string;
  tone: ReplyTone;
  suggestedActions: string[];
}

// ── Batch Triage Types ───────────────────────────────────────────────

export interface BatchTriageResult {
  totalProcessed: number;
  classifications: Array<{
    emailId: string;
    from: string;
    subject: string;
    category: EmailCategory;
    confidence: number;
    actionItems: ActionItem[];
    labelsApplied: string[];
    taskCreated: TaskCreationResult | null;
  }>;
  summary: {
    actionRequired: number;
    fyi: number;
    meetingRequests: number;
    newsletters: number;
    other: number;
  };
}
