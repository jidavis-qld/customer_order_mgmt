const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'orders.sqlite');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initialise();
  }
  return db;
}

function initialise() {
  db.exec(`
    -- One row per configured Gmail inbox.
    -- Phase 1: orders@fablefood.co only.
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

  // Seed Phase 1 inbox row on first run.
  const existing = db.prepare('SELECT id FROM inboxes WHERE id = ?').get('orders-au');
  if (!existing) {
    db.prepare(`
      INSERT INTO inboxes (id, email, display_name, enabled)
      VALUES (?, ?, ?, 1)
    `).run('orders-au', 'orders@fablefood.co', 'Australia');
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
    INSERT INTO emails (message_id, inbox_id, subject, sender_name, sender_email, received_at, body_text, is_read, fetched_at)
    VALUES (@message_id, @inbox_id, @subject, @sender_name, @sender_email, @received_at, @body_text, @is_read, @fetched_at)
    ON CONFLICT (message_id) DO UPDATE SET
      body_text  = excluded.body_text,
      fetched_at = excluded.fetched_at
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
      e.received_at, e.is_read, e.fetched_at,
      x.extracted_json, x.data_source, x.has_flags,
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
    SELECT e.*, x.extracted_json, x.extracted_at, x.model, x.data_source, x.has_flags
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

// ─── Attachment queries ───────────────────────────────────────────────────────

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

module.exports = {
  getDb,
  getInboxes,
  getInbox,
  updateInboxSyncTime,
  upsertEmail,
  getEmails,
  getEmail,
  emailExists,
  upsertAttachment,
  hasExtraction,
  upsertExtraction,
};
