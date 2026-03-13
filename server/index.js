require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');

const db = require('./db');
const auth = require('./auth');
const gmail = require('./gmail');
const { extractPdfText } = require('./pdf');
const { extractPO } = require('./extract');

const app = express();
const PORT = process.env.PORT || 8080;
const BASE = process.env.APP_BASE_PATH || '/orders';

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 },
}));

// ─── Auth routes ──────────────────────────────────────────────────────────────

// Step 1: Visit this URL once to start the Gmail OAuth flow for an inbox
app.get(`${BASE}/auth/setup`, (req, res) => {
  const inboxId = req.query.inbox || 'orders-au';
  const url = auth.getAuthUrl(inboxId);
  res.redirect(url);
});

// Step 2: Google redirects here with an auth code
app.get(`${BASE}/auth/callback`, async (req, res) => {
  const { code, state: inboxId = 'orders-au' } = req.query;
  if (!code) return res.status(400).send('Missing authorisation code.');

  try {
    await auth.handleCallback(code, inboxId);
    res.send(`
      <html><body style="font-family:sans-serif;padding:2rem">
        <h2>✅ Gmail connected for inbox: ${inboxId}</h2>
        <p>The refresh token has been saved. You can now close this tab and return to the PO Inbox.</p>
        <p>If running in production, copy the refresh token from the database and add it as
        <code>GMAIL_REFRESH_TOKEN</code> in Cloud Run environment variables.</p>
        <a href="${BASE}/">Go to PO Inbox →</a>
      </body></html>
    `);
  } catch (err) {
    console.error('[auth/callback]', err.message);
    res.status(500).send(`OAuth callback failed: ${err.message}`);
  }
});

// ─── API: Auth status ─────────────────────────────────────────────────────────

app.get(`${BASE}/api/auth/status`, (req, res) => {
  const inboxes = db.getInboxes().map(inbox => ({
    id: inbox.id,
    email: inbox.email,
    display_name: inbox.display_name,
    last_synced_at: inbox.last_synced_at,
    connected: !!(inbox.refresh_token || (inbox.id === 'orders-au' && process.env.GMAIL_REFRESH_TOKEN)),
    enabled: !!inbox.enabled,
  }));

  res.json({
    inboxes,
    claude_model: 'claude-sonnet-4-6',
    claude_configured: !!process.env.ANTHROPIC_API_KEY,
  });
});

// ─── API: Sync ────────────────────────────────────────────────────────────────

/**
 * POST /orders/api/sync
 * Fetch new emails from Gmail, extract PDF text, call Claude, cache results.
 * Accepts optional body: { inboxId, dateFrom, dateTo, maxResults }
 */
app.post(`${BASE}/api/sync`, async (req, res) => {
  const { inboxId = 'orders-au', dateFrom, dateTo, maxResults = 50 } = req.body || {};

  const inbox = db.getInbox(inboxId);
  if (!inbox) return res.status(404).json({ error: `Inbox "${inboxId}" not found.` });

  let authClient;
  try {
    authClient = auth.getAuthenticatedClient(inbox);
  } catch (err) {
    return res.status(401).json({
      error: err.message,
      setup_url: `${BASE}/auth/setup?inbox=${inboxId}`,
    });
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
        const sender = gmail.parseSender(headers.from || '');
        const bodyText = gmail.extractBody(message.payload);
        const receivedAt = new Date(parseInt(message.internalDate)).toISOString();

        // Persist the email
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
            pdfText = result.text;
            parseError = result.error ? 1 : 0;

            pdfResults.push({
              filename: part.filename,
              text: result.text,
              error: result.error,
            });
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

        // Call Claude for extraction (cached by messageId)
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

    // Parse extracted_json for each row to give the client clean objects
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

// ─── Serve React SPA ──────────────────────────────────────────────────────────

const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');

app.use(BASE, express.static(CLIENT_DIST));

// SPA catch-all: all non-API routes under BASE serve index.html
app.get(`${BASE}/*`, (req, res) => {
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

// Redirect bare root to the app
app.get('/', (req, res) => res.redirect(BASE + '/'));

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[orders-inbox] Listening on port ${PORT}, base path: ${BASE}`);
  console.log(`[orders-inbox] Dashboard: http://localhost:${PORT}${BASE}/`);
});
