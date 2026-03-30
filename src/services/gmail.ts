import { google, type gmail_v1 } from 'googleapis';
import { getOAuth2Client, isAuthenticated, getAuthUrl } from '../lib/auth.js';
import { parseGmailMessage } from './email-parser.js';
import type { EmailMessage } from '../types.js';

function getGmailClient(): gmail_v1.Gmail {
  if (!isAuthenticated()) {
    const url = getAuthUrl();
    throw new Error(
      `Gmail not authenticated. Visit this URL to authorize:\n\n${url}\n\n` +
      'Then use the authorize_gmail tool with the code you receive.'
    );
  }

  return google.gmail({ version: 'v1', auth: getOAuth2Client() });
}

/**
 * List messages matching a Gmail query.
 */
export async function listMessages(options: {
  query?: string;
  maxResults?: number;
  labelIds?: string[];
  pageToken?: string;
}): Promise<{ messages: Array<{ id: string; threadId: string }>; nextPageToken?: string }> {
  const gmail = getGmailClient();

  const response = await gmail.users.messages.list({
    userId: 'me',
    q: options.query,
    maxResults: options.maxResults ?? 20,
    labelIds: options.labelIds,
    pageToken: options.pageToken,
  });

  return {
    messages: (response.data.messages ?? []).map((m) => ({
      id: m.id!,
      threadId: m.threadId!,
    })),
    nextPageToken: response.data.nextPageToken ?? undefined,
  };
}

/**
 * Get a single message by ID with full content.
 */
export async function getMessage(messageId: string): Promise<EmailMessage> {
  const gmail = getGmailClient();

  const response = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return parseGmailMessage(response.data as any);
}

/**
 * Get a message with metadata only (faster, no body).
 */
export async function getMessageMetadata(messageId: string): Promise<EmailMessage> {
  const gmail = getGmailClient();

  const response = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'metadata',
    metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date', 'List-Unsubscribe', 'In-Reply-To'],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return parseGmailMessage(response.data as any);
}

/**
 * Get multiple messages by ID.
 */
export async function getMessages(
  messageIds: string[],
  options: { metadataOnly?: boolean } = {}
): Promise<EmailMessage[]> {
  const fetcher = options.metadataOnly ? getMessageMetadata : getMessage;

  // Batch in groups of 10 to avoid rate limiting
  const results: EmailMessage[] = [];
  for (let i = 0; i < messageIds.length; i += 10) {
    const batch = messageIds.slice(i, i + 10);
    const batchResults = await Promise.all(batch.map(fetcher));
    results.push(...batchResults);
  }

  return results;
}

/**
 * Get unread messages.
 */
export async function getUnreadMessages(maxResults: number = 50): Promise<EmailMessage[]> {
  const { messages } = await listMessages({
    query: 'is:unread',
    maxResults,
    labelIds: ['INBOX'],
  });

  if (messages.length === 0) return [];

  return getMessages(messages.map((m) => m.id));
}

/**
 * Search emails with a query string.
 */
export async function searchEmails(
  query: string,
  maxResults: number = 20
): Promise<EmailMessage[]> {
  const { messages } = await listMessages({ query, maxResults });
  if (messages.length === 0) return [];
  return getMessages(messages.map((m) => m.id));
}

/**
 * Add labels to a message.
 */
export async function addLabels(messageId: string, labelIds: string[]): Promise<void> {
  const gmail = getGmailClient();
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      addLabelIds: labelIds,
    },
  });
}

/**
 * Remove labels from a message.
 */
export async function removeLabels(messageId: string, labelIds: string[]): Promise<void> {
  const gmail = getGmailClient();
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      removeLabelIds: labelIds,
    },
  });
}

/**
 * Archive a message (remove INBOX label).
 */
export async function archiveMessage(messageId: string): Promise<void> {
  await removeLabels(messageId, ['INBOX']);
}

/**
 * Mark a message as read.
 */
export async function markAsRead(messageId: string): Promise<void> {
  await removeLabels(messageId, ['UNREAD']);
}

/**
 * Get or create a label by name.
 */
export async function getOrCreateLabel(labelName: string): Promise<string> {
  const gmail = getGmailClient();

  // Check existing labels
  const labelsResponse = await gmail.users.labels.list({ userId: 'me' });
  const existing = labelsResponse.data.labels?.find(
    (l) => l.name?.toLowerCase() === labelName.toLowerCase()
  );

  if (existing?.id) return existing.id;

  // Create new label
  const createResponse = await gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      name: labelName,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    },
  });

  return createResponse.data.id!;
}

/**
 * Get sent messages (for follow-up tracking).
 */
export async function getSentMessages(maxResults: number = 50): Promise<EmailMessage[]> {
  const { messages } = await listMessages({
    labelIds: ['SENT'],
    maxResults,
  });

  if (messages.length === 0) return [];
  return getMessages(messages.map((m) => m.id));
}
