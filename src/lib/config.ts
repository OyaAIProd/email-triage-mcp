import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { TrussConfig } from '../types.js';

const DATA_DIR = join(homedir(), '.truss');

// Ensure data directory exists on import
try {
  mkdirSync(DATA_DIR, { recursive: true });
} catch {
  // ignore — directory already exists
}

export function getConfig(): TrussConfig {
  return {
    gmailClientId: process.env.GMAIL_CLIENT_ID,
    gmailClientSecret: process.env.GMAIL_CLIENT_SECRET,
    licenseKey: process.env.TRUSS_LICENSE_KEY,
    linearApiKey: process.env.LINEAR_API_KEY,
    todoistApiToken: process.env.TODOIST_API_TOKEN,
    jiraEmail: process.env.JIRA_EMAIL,
    jiraApiToken: process.env.JIRA_API_TOKEN,
    jiraDomain: process.env.JIRA_DOMAIN,
    trussApiBaseUrl: process.env.TRUSS_API_BASE_URL || 'https://api.truss.dev',
    dataDir: DATA_DIR,
  };
}

export function getDataDir(): string {
  return DATA_DIR;
}

export function getTokenPath(): string {
  return join(DATA_DIR, 'gmail-tokens.json');
}

export function getDbPath(): string {
  return join(DATA_DIR, 'usage.db');
}
