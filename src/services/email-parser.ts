import type { EmailMessage } from '../types.js';

/**
 * Decode base64url-encoded content (Gmail uses URL-safe base64).
 */
function decodeBase64Url(encoded: string): string {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Strip HTML tags and decode common entities. Returns plain text.
 */
export function stripHtml(html: string): string {
  let text = html;

  // Remove style and script blocks
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

  // Replace block elements with newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|br\s*\/?)>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(td|th)>/gi, '\t');

  // Remove all remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&#x27;/g, "'");
  text = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));

  // Collapse whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * Extract header value from Gmail API message headers array.
 */
function getHeader(
  headers: Array<{ name: string; value: string }>,
  name: string
): string {
  const header = headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  );
  return header?.value ?? '';
}

/**
 * Recursively find MIME parts matching a given type.
 */
function findParts(
  payload: GmailPayload,
  mimeType: string
): GmailPayload[] {
  const results: GmailPayload[] = [];

  if (payload.mimeType === mimeType && payload.body?.data) {
    results.push(payload);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      results.push(...findParts(part, mimeType));
    }
  }

  return results;
}

// Minimal type for Gmail API payload structure
interface GmailPayload {
  mimeType: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPayload[];
  filename?: string;
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload: GmailPayload;
  internalDate?: string;
}

/**
 * Parse a raw Gmail API message into our EmailMessage type.
 */
export function parseGmailMessage(raw: GmailMessage): EmailMessage {
  const headers = raw.payload.headers ?? [];
  const from = getHeader(headers, 'From');
  const to = getHeader(headers, 'To')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const cc = getHeader(headers, 'Cc')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const subject = getHeader(headers, 'Subject');
  const dateStr = getHeader(headers, 'Date');

  // Extract body content
  const textParts = findParts(raw.payload, 'text/plain');
  const htmlParts = findParts(raw.payload, 'text/html');

  let body = '';
  let htmlBody = '';

  if (textParts.length > 0 && textParts[0].body?.data) {
    body = decodeBase64Url(textParts[0].body.data);
  }

  if (htmlParts.length > 0 && htmlParts[0].body?.data) {
    htmlBody = decodeBase64Url(htmlParts[0].body.data);
  }

  // Fall back to HTML-stripped text if no plain text part
  if (!body && htmlBody) {
    body = stripHtml(htmlBody);
  }

  // If body is in the root payload (single-part message)
  if (!body && raw.payload.body?.data) {
    const decoded = decodeBase64Url(raw.payload.body.data);
    if (raw.payload.mimeType === 'text/html') {
      htmlBody = decoded;
      body = stripHtml(decoded);
    } else {
      body = decoded;
    }
  }

  // Check for attachments
  const hasAttachments = checkAttachments(raw.payload);

  // Build headers map
  const headerMap: Record<string, string> = {};
  for (const h of headers) {
    headerMap[h.name.toLowerCase()] = h.value;
  }

  const labels = raw.labelIds ?? [];
  const isRead = !labels.includes('UNREAD');

  return {
    id: raw.id,
    threadId: raw.threadId,
    from,
    to,
    cc,
    subject,
    body,
    htmlBody,
    date: dateStr ? new Date(dateStr) : new Date(parseInt(raw.internalDate ?? '0', 10)),
    labels,
    snippet: raw.snippet ?? '',
    isRead,
    hasAttachments,
    headers: headerMap,
  };
}

function checkAttachments(payload: GmailPayload): boolean {
  if (payload.body?.attachmentId) return true;
  if (payload.filename && payload.filename.length > 0) return true;
  if (payload.parts) {
    return payload.parts.some((part) => checkAttachments(part));
  }
  return false;
}

/**
 * Extract the sender's email address from a "Name <email>" string.
 */
export function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from.trim();
}

/**
 * Extract the sender's display name.
 */
export function extractDisplayName(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : extractEmailAddress(from);
}
