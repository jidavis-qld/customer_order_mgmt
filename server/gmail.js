// PHASE 1: READ ONLY
// Only the following Gmail API methods are used:
//   users.messages.list
//   users.messages.get
//   users.messages.attachments.get
// No write operations of any kind.

const { google } = require('googleapis');

/**
 * Fetch all emails from the given Gmail account (dedicated orders inbox).
 * No subject filter — orders-app@fablefood.co receives only order-related emails
 * (direct POs and forwarded emails with arbitrary subjects). Claude classifies
 * each email as a PO or not.
 *
 * @param {OAuth2Client} authClient  Authenticated OAuth2 client
 * @param {object} options
 * @param {string} [options.email='me']  Gmail user address (or 'me')
 * @param {number} [options.maxResults=50]
 * @param {string} [options.pageToken]
 * @param {string} [options.dateFrom]  ISO date string (YYYY-MM-DD)
 * @param {string} [options.dateTo]    ISO date string (YYYY-MM-DD)
 * @returns {{ messages: object[], nextPageToken: string|null }}
 */
async function listPOEmails(authClient, options = {}) {
  const gmail = google.gmail({ version: 'v1', auth: authClient });
  const { email = 'me', maxResults = 50, pageToken, dateFrom, dateTo } = options;

  // Fetch ALL emails — this is a dedicated orders inbox so no subject filter needed.
  // Forwarded emails (Fwd: ...) would not match keyword filters, so we omit them entirely.
  let q = '';

  if (dateFrom) {
    const d = dateFrom.replace(/-/g, '/');
    q += `after:${d}`;
  }
  if (dateTo) {
    const d = dateTo.replace(/-/g, '/');
    q += `${q ? ' ' : ''}before:${d}`;
  }

  const res = await gmail.users.messages.list({
    userId: email,
    q: q || undefined,
    maxResults,
    pageToken: pageToken || undefined,
  });

  return {
    messages: res.data.messages || [],
    nextPageToken: res.data.nextPageToken || null,
  };
}

/**
 * Fetch the full message payload for a single email.
 *
 * @param {OAuth2Client} authClient
 * @param {string} messageId
 * @param {string} [email='me']
 */
async function getMessage(authClient, messageId, email = 'me') {
  const gmail = google.gmail({ version: 'v1', auth: authClient });
  const res = await gmail.users.messages.get({
    userId: email,
    id: messageId,
    format: 'full',
  });
  return res.data;
}

/**
 * Download a single attachment by its attachment ID.
 * Returns the raw data as a Buffer.
 *
 * @param {OAuth2Client} authClient
 * @param {string} messageId
 * @param {string} attachmentId
 * @param {string} [email='me']
 * @returns {Buffer}
 */
async function getAttachment(authClient, messageId, attachmentId, email = 'me') {
  const gmail = google.gmail({ version: 'v1', auth: authClient });
  const res = await gmail.users.messages.attachments.get({
    userId: email,
    messageId,
    id: attachmentId,
  });

  // Gmail returns base64url-encoded data
  const base64url = res.data.data;
  // Convert base64url → base64 → Buffer
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}

/**
 * Recursively walk message.payload.parts and collect all PDF parts.
 * Returns an array of { filename, attachmentId, mimeType, size }.
 *
 * @param {object} payload  Gmail message payload
 * @returns {Array<{ filename: string, attachmentId: string, mimeType: string, size: number }>}
 */
function extractPdfParts(payload) {
  const results = [];

  function walk(part) {
    if (!part) return;

    const isPdf =
      part.mimeType === 'application/pdf' ||
      (part.filename && part.filename.toLowerCase().endsWith('.pdf'));

    if (isPdf && part.body && part.body.attachmentId) {
      results.push({
        filename: part.filename || 'attachment.pdf',
        attachmentId: part.body.attachmentId,
        mimeType: part.mimeType,
        size: part.body.size || 0,
      });
    }

    if (part.parts) {
      part.parts.forEach(walk);
    }
  }

  walk(payload);
  return results;
}

/**
 * Extract plain-text body from a Gmail message payload.
 * Prefers text/plain, falls back to text/html (strips tags).
 *
 * @param {object} payload
 * @returns {string}
 */
function extractBody(payload) {
  let plainText = '';
  let htmlText = '';

  function walk(part) {
    if (!part) return;

    if (part.mimeType === 'text/plain' && part.body && part.body.data) {
      plainText += decodeBase64url(part.body.data);
    } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
      htmlText += decodeBase64url(part.body.data);
    }

    if (part.parts) part.parts.forEach(walk);
  }

  walk(payload);

  if (plainText.trim()) return plainText.trim();

  // Strip HTML tags as a rough fallback
  return htmlText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Parse sender "Name <email>" or plain email strings.
 * Returns { name, email }.
 */
function parseSender(from = '') {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: '', email: from.trim() };
}

function decodeBase64url(data) {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Extract relevant headers from a message as a flat object.
 */
function extractHeaders(payload) {
  const headers = {};
  (payload.headers || []).forEach(h => {
    headers[h.name.toLowerCase()] = h.value;
  });
  return headers;
}

module.exports = {
  listPOEmails,
  getMessage,
  getAttachment,
  extractPdfParts,
  extractBody,
  parseSender,
  extractHeaders,
};
