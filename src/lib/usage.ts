import Database from 'better-sqlite3';
import { getDbPath } from './config.js';
import { getLicenseStatus } from './license.js';

const FREE_TIER_DAILY_LIMIT = 10;

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(getDbPath());
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool_name TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        date_utc TEXT NOT NULL DEFAULT (date('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_usage_date ON usage(date_utc);
      CREATE INDEX IF NOT EXISTS idx_usage_tool ON usage(tool_name);

      CREATE TABLE IF NOT EXISTS follow_ups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email_id TEXT NOT NULL UNIQUE,
        from_addr TEXT NOT NULL,
        subject TEXT NOT NULL,
        sent_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'awaiting_response',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS email_analytics_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email_id TEXT NOT NULL,
        from_addr TEXT NOT NULL,
        category TEXT NOT NULL,
        response_time_hours REAL,
        hour_of_day INTEGER NOT NULL,
        date_utc TEXT NOT NULL DEFAULT (date('now')),
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_analytics_date ON email_analytics_log(date_utc);
    `);
  }
  return db;
}

export function recordToolUsage(toolName: string): void {
  const database = getDb();
  database.prepare('INSERT INTO usage (tool_name) VALUES (?)').run(toolName);
}

export function getTodayClassificationCount(): number {
  const database = getDb();
  const row = database
    .prepare("SELECT COUNT(*) as cnt FROM usage WHERE tool_name = 'classify_email' AND date_utc = date('now')")
    .get() as { cnt: number };
  return row.cnt;
}

export async function checkClassificationQuota(): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const license = await getLicenseStatus();

  if (license.tier === 'pro') {
    return { allowed: true, remaining: Infinity, limit: Infinity };
  }

  const used = getTodayClassificationCount();
  const remaining = Math.max(0, FREE_TIER_DAILY_LIMIT - used);

  return {
    allowed: remaining > 0,
    remaining,
    limit: FREE_TIER_DAILY_LIMIT,
  };
}

// ── Follow-up tracking ───────────────────────────────────────────────

export function addFollowUp(emailId: string, fromAddr: string, subject: string, sentDate: string): void {
  const database = getDb();
  database
    .prepare(
      `INSERT OR REPLACE INTO follow_ups (email_id, from_addr, subject, sent_date, status, updated_at)
       VALUES (?, ?, ?, ?, 'awaiting_response', datetime('now'))`
    )
    .run(emailId, fromAddr, subject, sentDate);
}

export function updateFollowUpStatus(emailId: string, status: string): void {
  const database = getDb();
  database
    .prepare("UPDATE follow_ups SET status = ?, updated_at = datetime('now') WHERE email_id = ?")
    .run(status, emailId);
}

export function getActiveFollowUps(): Array<{
  email_id: string;
  from_addr: string;
  subject: string;
  sent_date: string;
  status: string;
}> {
  const database = getDb();
  return database
    .prepare("SELECT email_id, from_addr, subject, sent_date, status FROM follow_ups WHERE status = 'awaiting_response' ORDER BY sent_date ASC")
    .all() as Array<{
      email_id: string;
      from_addr: string;
      subject: string;
      sent_date: string;
      status: string;
    }>;
}

// ── Analytics logging ────────────────────────────────────────────────

export function logEmailAnalytics(
  emailId: string,
  fromAddr: string,
  category: string,
  hourOfDay: number,
  responseTimeHours: number | null
): void {
  const database = getDb();
  database
    .prepare(
      'INSERT INTO email_analytics_log (email_id, from_addr, category, hour_of_day, response_time_hours) VALUES (?, ?, ?, ?, ?)'
    )
    .run(emailId, fromAddr, category, hourOfDay, responseTimeHours);
}

export function getAnalyticsData(days: number): {
  totalProcessed: number;
  categoryBreakdown: Record<string, number>;
  topSenders: Array<{ sender: string; count: number; avgResponseTime: number | null }>;
  avgResponseTime: number | null;
  busiestHours: Array<{ hour: number; count: number }>;
} {
  const database = getDb();

  const total = database
    .prepare("SELECT COUNT(*) as cnt FROM email_analytics_log WHERE date_utc >= date('now', ? || ' days')")
    .get(`-${days}`) as { cnt: number };

  const categories = database
    .prepare(
      "SELECT category, COUNT(*) as cnt FROM email_analytics_log WHERE date_utc >= date('now', ? || ' days') GROUP BY category"
    )
    .all(`-${days}`) as Array<{ category: string; cnt: number }>;

  const senders = database
    .prepare(
      `SELECT from_addr as sender, COUNT(*) as count, AVG(response_time_hours) as avgResponseTime
       FROM email_analytics_log WHERE date_utc >= date('now', ? || ' days')
       GROUP BY from_addr ORDER BY count DESC LIMIT 10`
    )
    .all(`-${days}`) as Array<{ sender: string; count: number; avgResponseTime: number | null }>;

  const avgResp = database
    .prepare(
      "SELECT AVG(response_time_hours) as avg FROM email_analytics_log WHERE response_time_hours IS NOT NULL AND date_utc >= date('now', ? || ' days')"
    )
    .get(`-${days}`) as { avg: number | null };

  const hours = database
    .prepare(
      "SELECT hour_of_day as hour, COUNT(*) as count FROM email_analytics_log WHERE date_utc >= date('now', ? || ' days') GROUP BY hour_of_day ORDER BY count DESC"
    )
    .all(`-${days}`) as Array<{ hour: number; count: number }>;

  const categoryBreakdown: Record<string, number> = {};
  for (const row of categories) {
    categoryBreakdown[row.category] = row.cnt;
  }

  return {
    totalProcessed: total.cnt,
    categoryBreakdown,
    topSenders: senders,
    avgResponseTime: avgResp.avg,
    busiestHours: hours,
  };
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
