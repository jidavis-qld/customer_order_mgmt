const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'orders.sqlite');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    // Use DELETE journal mode (not WAL) — WAL requires shared-memory files
    // which are incompatible with Cloud Run's GCS FUSE volume mounts.
    db.pragma('journal_mode = DELETE');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
    initialise();
  }
  return db;
}

function initialise() {
  db.exec(`
    -- One row per configured Gmail inbox.
    -- Phase 1: orders-app@fablefood.co only (real user, member of orders@fablefood.co group).
    -- Future: ordersuk@fablefood.co, ordersus@fablefood.co added without schema changes.
    -- Auth is via Service Account + Domain-Wide Delegation — no tokens stored here.
    CREATE TABLE IF NOT EXISTS inboxes (
      id             TEXT PRIMARY KEY,
      email          TEXT UNIQUE NOT NULL,
      display_name   TEXT,
      last_synced_at TEXT,
      enabled        INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS emails (
      message_id   TEXT PRIMARY KEY,
      inbox_id     TEXT NOT NULL,
      subject      TEXT,
      sender_name  TEXT,
      sender_email TEXT,
      received_at  TEXT,
      body_text    TEXT,
      is_read      INTEGER NOT NULL DEFAULT 0,
      fetched_at   TEXT,
      FOREIGN KEY (inbox_id) REFERENCES inboxes(id)
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id           TEXT PRIMARY KEY,
      message_id   TEXT NOT NULL,
      filename     TEXT,
      size_bytes   INTEGER,
      pdf_text     TEXT,
      parse_error  INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (message_id) REFERENCES emails(message_id)
    );

    CREATE TABLE IF NOT EXISTS extractions (
      message_id     TEXT PRIMARY KEY,
      extracted_json TEXT,
      extracted_at   TEXT,
      model          TEXT,
      data_source    TEXT,
      has_flags      INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (message_id) REFERENCES emails(message_id)
    );

    CREATE INDEX IF NOT EXISTS idx_emails_inbox    ON emails (inbox_id);
    CREATE INDEX IF NOT EXISTS idx_emails_received ON emails (received_at);
    CREATE INDEX IF NOT EXISTS idx_attachments_msg ON attachments (message_id);
  `);

  // ── Safe migrations (idempotent via try/catch) ───────────────────────────

  // Thread tracking — groups Gmail conversation threads together so Claude
  // can understand that a reply email is part of an existing PO thread.
  try { db.exec('ALTER TABLE emails ADD COLUMN thread_id TEXT NULL'); } catch (_) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_emails_thread ON emails (thread_id)'); } catch (_) {}

  // Human feedback — lets the team confirm or correct Claude's classification.
  // NULL = no feedback yet; 0 = team says NOT a PO; 1 = team says IS a PO.
  // These verified examples are injected into future Claude prompts (few-shot learning).
  try { db.exec('ALTER TABLE extractions ADD COLUMN human_is_po INTEGER NULL'); } catch (_) {}
  try { db.exec('ALTER TABLE extractions ADD COLUMN human_feedback_at TEXT NULL'); } catch (_) {}

  // Seed Phase 1 inbox row on first run.
  const existing = db.prepare('SELECT id FROM inboxes WHERE id = ?').get('orders-au');
  if (!existing) {
    db.prepare(`
      INSERT INTO inboxes (id, email, display_name, enabled)
      VALUES (?, ?, ?, 1)
    `).run('orders-au', 'orders-app@fablefood.co', 'Australia');
  }
}

// ─── Inbox queries ────────────────────────────────────────────────────────────

function getInboxes() {
  return getDb().prepare('SELECT id, email, display_name, last_synced_at, enabled FROM inboxes').all();
}

function getInbox(id) {
  return getDb().prepare('SELECT * FROM inboxes WHERE id = ?').get(id);
}

function updateInboxSyncTime(id) {
  return getDb().prepare("UPDATE inboxes SET last_synced_at = datetime('now') WHERE id = ?").run(id);
}

// ─── Email queries ────────────────────────────────────────────────────────────

function upsertEmail(email) {
  return getDb().prepare(`
    INSERT INTO emails (message_id, inbox_id, subject, sender_name, sender_email, received_at, body_text, is_read, fetched_at, thread_id)
    VALUES (@message_id, @inbox_id, @subject, @sender_name, @sender_email, @received_at, @body_text, @is_read, @fetched_at, @thread_id)
    ON CONFLICT (message_id) DO UPDATE SET
      body_text  = excluded.body_text,
      fetched_at = excluded.fetched_at,
      thread_id  = COALESCE(excluded.thread_id, emails.thread_id)
  `).run(email);
}

function getEmails(filters = {}) {
  const { dateFrom, dateTo, customer, flagged, unread, inboxId } = filters;
  const conditions = [];
  const params = [];

  if (inboxId)  { conditions.push('e.inbox_id = ?');                         params.push(inboxId); }
  if (dateFrom) { conditions.push('e.received_at >= ?');                     params.push(dateFrom); }
  if (dateTo)   { conditions.push('e.received_at <= ?');                     params.push(dateTo); }
  if (customer) { conditions.push('(e.sender_name LIKE ? OR e.sender_email LIKE ? OR json_extract(x.extracted_json, "$.customer_name") LIKE ?)');
                  params.push(`%${customer}%`, `%${customer}%`, `%${customer}%`); }
  if (flagged === 'true')  conditions.push('x.has_flags = 1');
  if (unread === 'true')   conditions.push('e.is_read = 0');

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  return getDb().prepare(`
    SELECT
      e.message_id, e.inbox_id, e.subject, e.sender_name, e.sender_email,
      e.received_at, e.is_read, e.fetched_at, e.thread_id,
      x.extracted_json, x.data_source, x.has_flags, x.human_is_po,
      (SELECT COUNT(*) FROM attachments a WHERE a.message_id = e.message_id) AS attachment_count,
      (SELECT COUNT(*) FROM attachments a WHERE a.message_id = e.message_id AND a.parse_error = 1) AS attachment_errors
    FROM emails e
    LEFT JOIN extractions x ON x.message_id = e.message_id
    ${where}
    ORDER BY e.received_at DESC
  `).all(...params);
}

function getEmail(messageId) {
  const email = getDb().prepare(`
    SELECT e.*, x.extracted_json, x.extracted_at, x.model, x.data_source, x.has_flags,
           x.human_is_po, x.human_feedback_at
    FROM emails e
    LEFT JOIN extractions x ON x.message_id = e.message_id
    WHERE e.message_id = ?
  `).get(messageId);

  if (!email) return null;

  email.attachments = getDb().prepare(
    'SELECT id, filename, size_bytes, pdf_text, parse_error FROM attachments WHERE message_id = ?'
  ).all(messageId);

  return email;
}

function emailExists(messageId) {
  return !!getDb().prepare('SELECT 1 FROM emails WHERE message_id = ?').get(messageId);
}

// ─── Thread queries ───────────────────────────────────────────────────────────

/**
 * Returns all emails in the same Gmail thread, ordered oldest first.
 * Used to inject thread context into the Claude extraction prompt.
 */
function getThreadEmails(threadId) {
  if (!threadId) return [];
  return getDb().prepare(`
    SELECT e.message_id, e.subject, e.sender_name, e.sender_email, e.received_at,
           x.extracted_json
    FROM emails e
    LEFT JOIN extractions x ON x.message_id = e.message_id
    WHERE e.thread_id = ?
    ORDER BY e.received_at ASC
  `).all(threadId);
}

// ─── Attachment queries ───────────────────────────────────────────────────────

function getAttachment(id) {
  return getDb().prepare('SELECT * FROM attachments WHERE id = ?').get(id);
}

function upsertAttachment(attachment) {
  return getDb().prepare(`
    INSERT INTO attachments (id, message_id, filename, size_bytes, pdf_text, parse_error)
    VALUES (@id, @message_id, @filename, @size_bytes, @pdf_text, @parse_error)
    ON CONFLICT (id) DO UPDATE SET
      pdf_text    = excluded.pdf_text,
      parse_error = excluded.parse_error
  `).run(attachment);
}

// ─── Extraction queries ───────────────────────────────────────────────────────

function hasExtraction(messageId) {
  return !!getDb().prepare('SELECT 1 FROM extractions WHERE message_id = ?').get(messageId);
}

function upsertExtraction(extraction) {
  return getDb().prepare(`
    INSERT INTO extractions (message_id, extracted_json, extracted_at, model, data_source, has_flags)
    VALUES (@message_id, @extracted_json, @extracted_at, @model, @data_source, @has_flags)
    ON CONFLICT (message_id) DO UPDATE SET
      extracted_json = excluded.extracted_json,
      extracted_at   = excluded.extracted_at,
      model          = excluded.model,
      data_source    = excluded.data_source,
      has_flags      = excluded.has_flags
  `).run(extraction);
}

// ─── Feedback / learning queries ──────────────────────────────────────────────

/**
 * Save a human classification for an email.
 * isPo: true = IS a purchase order, false = NOT a purchase order.
 */
function saveFeedback(messageId, isPo) {
  return getDb().prepare(`
    UPDATE extractions
    SET human_is_po = ?, human_feedback_at = ?
    WHERE message_id = ?
  `).run(isPo ? 1 : 0, new Date().toISOString(), messageId);
}

/**
 * Delete an extraction so the next sync re-runs Claude on this email.
 * Used when a human corrects a "not a PO" → "is a PO" override —
 * the re-extraction will now use better few-shot examples and produce
 * properly filled line items, PO number, etc.
 */
function clearExtraction(messageId) {
  return getDb().prepare('DELETE FROM extractions WHERE message_id = ?').run(messageId);
}

/**
 * Returns up to `limit` human-verified examples for use as few-shot context
 * in Claude's prompt. Balanced: up to half POs, half non-POs, most recent first.
 */
function getFeedbackExamples(limit = 10) {
  const half = Math.floor(limit / 2);
  const poExamples = getDb().prepare(`
    SELECT e.subject, e.sender_name, e.sender_email,
           SUBSTR(e.body_text, 1, 400) AS body_snippet,
           x.human_is_po AS is_po,
           CASE WHEN (
             SELECT COUNT(*) FROM emails e2
             WHERE e2.thread_id = e.thread_id AND e2.received_at < e.received_at
           ) > 0 THEN 1 ELSE 0 END AS is_thread_reply
    FROM emails e
    JOIN extractions x ON x.message_id = e.message_id
    WHERE x.human_is_po = 1
    ORDER BY x.human_feedback_at DESC
    LIMIT ?
  `).all(half + 1); // +1 to allow uneven split

  const nonPoExamples = getDb().prepare(`
    SELECT e.subject, e.sender_name, e.sender_email,
           SUBSTR(e.body_text, 1, 400) AS body_snippet,
           x.human_is_po AS is_po,
           CASE WHEN (
             SELECT COUNT(*) FROM emails e2
             WHERE e2.thread_id = e.thread_id AND e2.received_at < e.received_at
           ) > 0 THEN 1 ELSE 0 END AS is_thread_reply
    FROM emails e
    JOIN extractions x ON x.message_id = e.message_id
    WHERE x.human_is_po = 0
    ORDER BY x.human_feedback_at DESC
    LIMIT ?
  `).all(half);

  return [...poExamples, ...nonPoExamples];
}

/**
 * Returns sender reputation derived from human feedback.
 * Only returns senders with at least 2 verified emails (confident pattern).
 * Used to tell Claude "this sender always / never sends POs".
 */
function getSenderReputation() {
  return getDb().prepare(`
    SELECT
      e.sender_email,
      e.sender_name,
      COUNT(*)                                        AS total,
      SUM(CASE WHEN x.human_is_po = 1 THEN 1 ELSE 0 END) AS po_count
    FROM emails e
    JOIN extractions x ON x.message_id = e.message_id
    WHERE x.human_is_po IS NOT NULL
    GROUP BY e.sender_email
    HAVING total >= 2
  `).all();
}

module.exports = {
  getDb,
  getInboxes,
  getInbox,
  updateInboxSyncTime,
  upsertEmail,
  getEmails,
  getEmail,
  emailExists,
  getThreadEmails,
  getAttachment,
  upsertAttachment,
  hasExtraction,
  upsertExtraction,
  saveFeedback,
  clearExtraction,
  getFeedbackExamples,
  getSenderReputation,
};
