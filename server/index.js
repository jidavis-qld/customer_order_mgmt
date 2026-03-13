require('dotenv').config();

const express = require('express');
const path = require('path');

const db = require('./db');
const { getGmailClient, credentialsConfigured } = require('./auth');
const gmail = require('./gmail');
const { extractPdfText } = require('./pdf');
const { extractPO } = require('./extract');

const app = express();
const PORT = process.env.PORT || 8080;
const BASE = process.env.APP_BASE_PATH || '/orders';

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json());

// ─── API: Auth / connection status ───────────────────────────────────────────

app.get(`${BASE}/api/auth/status`, (req, res) => {
  const configured = credentialsConfigured();

  const inboxes = db.getInboxes().map(inbox => ({
    id:             inbox.id,
    email:          inbox.email,
    display_name:   inbox.display_name,
    last_synced_at: inbox.last_synced_at,
    connected:      configured,   // DWD: all inboxes use the same service account
    enabled:        !!inbox.enabled,
  }));

  res.json({
    auth_method:        'service_account_dwd',
    credentials_source: process.env.GOOGLE_CREDENTIALS_JSON ? 'GOOGLE_CREDENTIALS_JSON' :
                        process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'GOOGLE_APPLICATION_CREDENTIALS' :
                        'none',
    credentials_ok:     configured,
    inboxes,
    claude_model:       'claude-sonnet-4-6',
    claude_configured:  !!process.env.ANTHROPIC_API_KEY,
  });
});

// ─── API: Sync ────────────────────────────────────────────────────────────────

/**
 * POST /orders/api/sync
 * Fetch new emails from Gmail, extract PDF text, call Claude, cache results.
 * Body: { inboxId?, dateFrom?, dateTo?, maxResults? }
 */
app.post(`${BASE}/api/sync`, async (req, res) => {
  const { inboxId = 'orders-au', dateFrom, dateTo, maxResults = 50 } = req.body || {};

  const inbox = db.getInbox(inboxId);
  if (!inbox) return res.status(404).json({ error: `Inbox "${inboxId}" not found.` });

  if (!credentialsConfigured()) {
    return res.status(503).json({
      error: 'Gmail credentials not configured. Set GOOGLE_CREDENTIALS_JSON (service account key) in Cloud Run environment variables.',
    });
  }

  let authClient;
  try {
    authClient = await getGmailClient(inbox.email);
  } catch (err) {
    return res.status(500).json({ error: `Failed to create Gmail client: ${err.message}` });
  }

  const results = { fetched: 0, new: 0, extracted: 0, errors: [] };

  try {
    const { messages } = await gmail.listPOEmails(authClient, {
      email: inbox.email,
      maxResults,
      dateFrom,
      dateTo,
    });

    results.fetched = messages.length;

    for (const { id: messageId } of messages) {
      try {
        // Skip emails we've already fully extracted
        if (db.emailExists(messageId) && db.hasExtraction(messageId)) continue;

        const message = await gmail.getMessage(authClient, messageId, inbox.email);
        const headers = gmail.extractHeaders(message.payload);
        const sender  = gmail.parseSender(headers.from || '');
        const bodyText = gmail.extractBody(message.payload);
        const receivedAt = new Date(parseInt(message.internalDate)).toISOString();

        db.upsertEmail({
          message_id:   messageId,
          inbox_id:     inboxId,
          subject:      headers.subject || '(no subject)',
          sender_name:  sender.name,
          sender_email: sender.email,
          received_at:  receivedAt,
          body_text:    bodyText,
          is_read:      message.labelIds?.includes('UNREAD') ? 0 : 1,
          fetched_at:   new Date().toISOString(),
          thread_id:    message.threadId || null,
        });
        results.new++;

        // Process PDF attachments
        const pdfParts = gmail.extractPdfParts(message.payload);
        const pdfResults = [];

        for (const part of pdfParts) {
          const attachmentId = `${messageId}_${part.attachmentId}`;
          let pdfText = '';
          let parseError = 0;

          try {
            const buffer = await gmail.getAttachment(
              authClient, messageId, part.attachmentId, inbox.email
            );
            const result = await extractPdfText(buffer, part.filename);
            pdfText    = result.text;
            parseError = result.error ? 1 : 0;
            pdfResults.push({ filename: part.filename, text: result.text, error: result.error });
          } catch (err) {
            console.error(`[sync] Attachment error for ${messageId}:`, err.message);
            parseError = 1;
            results.errors.push(`Attachment error (${part.filename}): ${err.message}`);
          }

          db.upsertAttachment({
            id:          attachmentId,
            message_id:  messageId,
            filename:    part.filename,
            size_bytes:  part.size,
            pdf_text:    pdfText,
            parse_error: parseError,
          });
        }

        await extractPO({ messageId, emailBody: bodyText, pdfResults });
        results.extracted++;

      } catch (err) {
        console.error(`[sync] Error processing message ${messageId}:`, err.message);
        results.errors.push(`Message ${messageId}: ${err.message}`);
      }
    }

    db.updateInboxSyncTime(inboxId);
    res.json({ ok: true, ...results });

  } catch (err) {
    console.error('[sync] Fatal error:', err.message);
    res.status(500).json({ error: err.message, ...results });
  }
});

// ─── API: Emails list ─────────────────────────────────────────────────────────

app.get(`${BASE}/api/emails`, (req, res) => {
  try {
    const { dateFrom, dateTo, customer, flagged, unread, inboxId } = req.query;
    const emails = db.getEmails({ dateFrom, dateTo, customer, flagged, unread, inboxId });

    const rows = emails.map(row => {
      let extracted = null;
      if (row.extracted_json) {
        try { extracted = JSON.parse(row.extracted_json); } catch {}
      }
      return { ...row, extracted_json: undefined, extracted };
    });

    res.json(rows);
  } catch (err) {
    console.error('[GET /emails]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Single email ────────────────────────────────────────────────────────

app.get(`${BASE}/api/emails/:id`, (req, res) => {
  try {
    const email = db.getEmail(req.params.id);
    if (!email) return res.status(404).json({ error: 'Email not found.' });

    let extracted = null;
    if (email.extracted_json) {
      try { extracted = JSON.parse(email.extracted_json); } catch {}
    }

    res.json({ ...email, extracted_json: undefined, extracted });
  } catch (err) {
    console.error('[GET /emails/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Human feedback (learning) ───────────────────────────────────────────

/**
 * PATCH /orders/api/emails/:id/feedback
 * Record whether the team agrees with Claude's classification.
 * Body: { is_purchase_order: true | false }
 *
 * If the team overrides "not a PO" → "is a PO", we clear the extraction cache
 * so the next sync re-runs Claude (now armed with this example + better few-shot).
 */
app.patch(`${BASE}/api/emails/:id/feedback`, (req, res) => {
  try {
    const { is_purchase_order } = req.body || {};
    if (typeof is_purchase_order !== 'boolean') {
      return res.status(400).json({ error: 'is_purchase_order must be a boolean' });
    }

    const email = db.getEmail(req.params.id);
    if (!email) return res.status(404).json({ error: 'Email not found.' });
    if (!email.extracted_json) return res.status(409).json({ error: 'Email has not been extracted yet.' });

    let claudeIsPo = null;
    try {
      claudeIsPo = JSON.parse(email.extracted_json)?.is_purchase_order ?? null;
    } catch (_) {}

    db.saveFeedback(req.params.id, is_purchase_order);

    // If the human says IS a PO but Claude classified it as NOT a PO,
    // clear the extraction so the next sync re-extracts with better context.
    const willReExtract = is_purchase_order === true && claudeIsPo === false;
    if (willReExtract) {
      db.clearExtraction(req.params.id);
    }

    res.json({ ok: true, willReExtract });
  } catch (err) {
    console.error('[PATCH /emails/:id/feedback]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Re-extract (force Claude re-run) ────────────────────────────────────

/**
 * POST /orders/api/emails/:id/reextract
 * Force Claude to re-process this email from scratch, ignoring the cached result.
 * Useful after a prompt update, or when the human knows the extraction was wrong.
 * Preserves any existing human feedback (human_is_po is not cleared).
 */
app.post(`${BASE}/api/emails/:id/reextract`, async (req, res) => {
  try {
    const email = db.getEmail(req.params.id);
    if (!email) return res.status(404).json({ error: 'Email not found.' });

    if (!credentialsConfigured()) {
      return res.status(503).json({ error: 'Gmail credentials not configured.' });
    }

    // Re-fetch PDF attachments from Gmail so we have the full text
    const inbox = db.getInbox(email.inbox_id);
    const authClient = await getGmailClient(inbox.email);
    const message = await gmail.getMessage(authClient, req.params.id, inbox.email);
    const pdfParts = gmail.extractPdfParts(message.payload);
    const pdfResults = [];

    for (const part of pdfParts) {
      const att = db.getAttachment(`${req.params.id}_${part.attachmentId}`);
      if (att?.pdf_text) {
        // Use cached PDF text if available
        pdfResults.push({ filename: part.filename, text: att.pdf_text, error: !!att.parse_error });
      } else {
        try {
          const buffer = await gmail.getAttachment(authClient, req.params.id, part.attachmentId, inbox.email);
          const result = await extractPdfText(buffer, part.filename);
          pdfResults.push({ filename: part.filename, text: result.text, error: result.error });
        } catch (_) {
          pdfResults.push({ filename: part.filename, text: '', error: true });
        }
      }
    }

    const parsed = await extractPO({
      messageId:      req.params.id,
      emailBody:      email.body_text,
      pdfResults,
      forceReExtract: true,
    });

    // Re-fetch to include the updated extraction in the response
    const updated = db.getEmail(req.params.id);
    let extracted = null;
    if (updated.extracted_json) {
      try { extracted = JSON.parse(updated.extracted_json); } catch (_) {}
    }

    res.json({ ok: true, extracted });
  } catch (err) {
    console.error('[POST /emails/:id/reextract]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Attachment (PDF) viewer ─────────────────────────────────────────────

/**
 * GET /orders/api/attachments/:id
 * Fetches the raw PDF for an attachment from Gmail and streams it back.
 * The attachment id in the DB is `${messageId}_${gmailAttachmentId}`.
 */
app.get(`${BASE}/api/attachments/:id`, async (req, res) => {
  try {
    const att = db.getAttachment(req.params.id);
    if (!att) return res.status(404).json({ error: 'Attachment not found.' });

    const email = db.getEmail(att.message_id);
    if (!email) return res.status(404).json({ error: 'Parent email not found.' });

    const inbox = db.getInbox(email.inbox_id);
    if (!inbox) return res.status(404).json({ error: 'Inbox not found.' });

    if (!credentialsConfigured()) {
      return res.status(503).json({ error: 'Gmail credentials not configured.' });
    }

    const authClient = await getGmailClient(inbox.email);

    // The stored id is `${messageId}_${gmailAttachmentId}` — strip the prefix
    const gmailAttachmentId = att.id.substring(att.message_id.length + 1);

    const buffer = await gmail.getAttachment(authClient, att.message_id, gmailAttachmentId, inbox.email);

    const filename = encodeURIComponent(att.filename || 'attachment.pdf');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);

  } catch (err) {
    console.error('[GET /attachments/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Serve React SPA ──────────────────────────────────────────────────────────

const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');

app.use(BASE, express.static(CLIENT_DIST));

app.get(`${BASE}/*`, (req, res) => {
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

app.get('/', (req, res) => res.redirect(BASE + '/'));

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[orders-inbox] Listening on port ${PORT}, base path: ${BASE}`);
  console.log(`[orders-inbox] Dashboard: http://localhost:${PORT}${BASE}/`);
});
