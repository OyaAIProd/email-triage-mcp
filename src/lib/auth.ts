import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { getConfig, getTokenPath } from './config.js';
import type { OAuth2Client } from 'google-auth-library';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.labels',
];

interface StoredTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expiry_date: number;
}

let cachedClient: OAuth2Client | null = null;

export function getOAuth2Client(): OAuth2Client {
  if (cachedClient) return cachedClient;

  const config = getConfig();

  if (!config.gmailClientId || !config.gmailClientSecret) {
    throw new Error(
      'Gmail OAuth credentials not configured. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET environment variables. ' +
      'See https://console.cloud.google.com/apis/credentials to create OAuth 2.0 credentials.'
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    config.gmailClientId,
    config.gmailClientSecret,
    'urn:ietf:wg:oauth:2.0:oob' // Desktop/CLI flow redirect URI
  );

  // Load stored tokens if available
  const tokenPath = getTokenPath();
  if (existsSync(tokenPath)) {
    try {
      const tokens = JSON.parse(readFileSync(tokenPath, 'utf-8')) as StoredTokens;
      oauth2Client.setCredentials(tokens);
      cachedClient = oauth2Client;
    } catch {
      // Invalid token file — will need re-auth
    }
  }

  // Set up automatic token refresh persistence
  oauth2Client.on('tokens', (tokens) => {
    if (tokens.refresh_token || tokens.access_token) {
      try {
        const existing = existsSync(tokenPath)
          ? JSON.parse(readFileSync(tokenPath, 'utf-8')) as StoredTokens
          : {};
        const merged = { ...existing, ...tokens };
        writeFileSync(tokenPath, JSON.stringify(merged, null, 2), { mode: 0o600 });
      } catch {
        // non-fatal
      }
    }
  });

  cachedClient = oauth2Client;
  return oauth2Client;
}

export function getAuthUrl(): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

export async function exchangeCode(code: string): Promise<void> {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const tokenPath = getTokenPath();
  writeFileSync(tokenPath, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

export function isAuthenticated(): boolean {
  const tokenPath = getTokenPath();
  if (!existsSync(tokenPath)) return false;

  try {
    const tokens = JSON.parse(readFileSync(tokenPath, 'utf-8')) as StoredTokens;
    return !!(tokens.refresh_token || tokens.access_token);
  } catch {
    return false;
  }
}

export function clearCachedClient(): void {
  cachedClient = null;
}
