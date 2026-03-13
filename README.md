# Fable Food PO Inbox

A read-only web application that connects to Fable Food Gmail inboxes, fetches incoming Purchase Order emails, extracts structured order data from email bodies and PDF attachments using Claude AI, and presents a clean dashboard for the team.

**Live URL:** `https://app.fablefood.co/orders/`

> **Phase 1 — Read Only.** No emails are sent. No data is modified.
> Gmail access is strictly `gmail.readonly` scope.

---

## How It Works

```
Gmail inbox (orders@fablefood.co)
        │
        │  Gmail API — Service Account + DWD
        ▼
   Express server  ──►  pdf-parse  ──►  Claude claude-sonnet-4-6
        │                                        │
        │                              Structured JSON extraction
        ▼                                        │
   SQLite (cache)  ◄───────────────────────────-─┘
        │
        ▼
   React dashboard  (served at /orders/)
```

1. **Sync** — the server calls the Gmail API to list and fetch new PO emails from the configured inboxes.
2. **Parse** — PDF attachments are downloaded and text-extracted via `pdf-parse`.
3. **Extract** — the email body + PDF text are sent to Claude, which returns structured JSON (customer, PO number, line items, delivery date, flags, etc.). Results are cached in SQLite — Claude is never called twice for the same email.
4. **Display** — the React frontend reads from the SQLite cache via a small REST API.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Server | Node.js 20 + Express 4 |
| Frontend | React 18 + Vite (compiled, served by Express) |
| AI | Anthropic Claude `claude-sonnet-4-6` |
| PDF | `pdf-parse` |
| Database | SQLite — `better-sqlite3` |
| Gmail auth | Google Service Account + Domain-Wide Delegation (`gmail.readonly`) |
| Deployment | GCP Cloud Run — `australia-southeast1` |
| Image | `gcr.io/in-demand-87605/orders-inbox` |
| LB path | `/orders/*` → `orders-inbox-backend` on `fablefood-apps-lb` |
| User auth | Google IAP (handled by the load balancer — no code needed) |

---

## Project Structure

```
customer_order_mgmt/
├── server/
│   ├── index.js      # Express entry point — API routes + static SPA serving
│   ├── auth.js       # Gmail auth via Service Account + DWD (no OAuth flow)
│   ├── gmail.js      # Gmail API — list, fetch, attachments (READ ONLY)
│   ├── pdf.js        # PDF attachment download + text extraction
│   ├── extract.js    # Claude API extraction + SQLite caching
│   └── db.js         # SQLite schema, indexes, seed data, query functions
├── client/
│   ├── src/
│   │   ├── App.jsx              # Router — base path /orders/
│   │   └── views/
│   │       ├── Inbox.jsx        # PO list with filters + Refresh button
│   │       ├── PODetail.jsx     # Individual PO — all extracted fields
│   │       └── Settings.jsx     # Gmail/Claude connection status
│   ├── vite.config.js
│   └── package.json
├── Dockerfile          # Two-stage: builds React client, then runs Express
├── cloudbuild.yaml     # GCP Cloud Build — build → push → Cloud Run deploy
├── package.json        # Server dependencies
├── .env.example        # Environment variable reference
└── .gitignore
```

---

## Database Schema

SQLite database at `./orders.sqlite` (not committed — auto-created on first run).

### `inboxes`
One row per connected Gmail account.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | e.g. `orders-au`, `orders-uk` |
| `email` | TEXT UNIQUE | e.g. `orders@fablefood.co` |
| `display_name` | TEXT | e.g. `Australia` |
| `last_synced_at` | TEXT | ISO timestamp of last successful sync |
| `enabled` | INTEGER | `1` = active, `0` = paused |

Seeded on first run: `orders-au` / `orders@fablefood.co` / `Australia`.
No schema changes needed to add future inboxes.

### `emails`
One row per Gmail message.

| Column | Type | Notes |
|---|---|---|
| `message_id` | TEXT PK | Gmail message ID |
| `inbox_id` | TEXT FK | → `inboxes.id` |
| `subject` | TEXT | |
| `sender_name` | TEXT | |
| `sender_email` | TEXT | |
| `received_at` | TEXT | ISO timestamp |
| `body_text` | TEXT | Plain text body (HTML stripped) |
| `is_read` | INTEGER | `0` = unread, `1` = read |
| `fetched_at` | TEXT | When this app fetched it |

### `attachments`
One row per PDF attachment.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `{message_id}_{attachmentId}` |
| `message_id` | TEXT FK | → `emails.message_id` |
| `filename` | TEXT | |
| `size_bytes` | INTEGER | |
| `pdf_text` | TEXT | Extracted text, or empty if parse failed |
| `parse_error` | INTEGER | `1` if pdf-parse failed |

### `extractions`
One row per email — Claude's structured output, cached forever.

| Column | Type | Notes |
|---|---|---|
| `message_id` | TEXT PK | → `emails.message_id` |
| `extracted_json` | TEXT | Full Claude JSON response |
| `extracted_at` | TEXT | ISO timestamp |
| `model` | TEXT | e.g. `claude-sonnet-4-6` |
| `data_source` | TEXT | `email_only`, `pdf_only`, or `email_and_pdf` |
| `has_flags` | INTEGER | `1` if Claude flagged anything |

### Indexes

```sql
idx_emails_inbox     ON emails (inbox_id)
idx_emails_received  ON emails (received_at)
idx_attachments_msg  ON attachments (message_id)
```

---

## API Reference

All routes are prefixed with `/orders`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/auth/status` | Gmail + Claude connection status |
| `POST` | `/api/sync` | Fetch new emails and run Claude extraction |
| `GET` | `/api/emails` | List POs (filterable) |
| `GET` | `/api/emails/:id` | Single PO with extracted data and attachments |

### `POST /api/sync`

Fetches new emails from Gmail, extracts PDF text, calls Claude, caches results.
Already-extracted emails are skipped — Claude is never called twice for the same message.

**Request body** (all optional):
```json
{
  "inboxId":    "orders-au",
  "dateFrom":   "2025-01-01",
  "dateTo":     "2025-12-31",
  "maxResults": 50
}
```

**Response:**
```json
{
  "ok": true,
  "fetched": 12,
  "new": 4,
  "extracted": 4,
  "errors": []
}
```

### `GET /api/emails`

**Query params:** `dateFrom`, `dateTo`, `customer`, `flagged=true`, `unread=true`, `inboxId`

### Claude extraction schema

Each `extracted_json` has this shape:

```json
{
  "customer_name": "ACME Supermarkets",
  "customer_email": "procurement@acme.com.au",
  "customer_phone": "+61 2 9000 0000",
  "po_number": "PO-2025-0042",
  "order_date": "2025-03-10",
  "requested_delivery_date": "2025-03-14",
  "requested_delivery_day": "Friday",
  "delivery_address": "123 Main St, Sydney NSW 2000",
  "line_items": [
    {
      "product_name": "Baby Spinach 1kg",
      "sku_or_code": "SPK-001",
      "quantity": 20,
      "unit": "bag",
      "unit_price": 4.50,
      "line_total": 90.00
    }
  ],
  "order_total": 90.00,
  "currency": "AUD",
  "special_instructions": "Leave at back dock",
  "payment_terms": "30 days",
  "data_source": "email_and_pdf",
  "flags": []
}
```

`null` is used for any field Claude cannot find — values are never guessed.
`flags` is an array of strings describing anything that needs human attention.

---

## Environment Variables

```bash
# Required — full service account key JSON as a single line
# See "Gmail Access" below for setup
GOOGLE_CREDENTIALS_JSON={"type":"service_account",...}

# Required — Anthropic API key
ANTHROPIC_API_KEY=sk-ant-...

# Optional — defaults shown
PORT=8080
APP_BASE_PATH=/orders
DB_PATH=./orders.sqlite   # SQLite file location
```

Copy `.env.example` to `.env` for local dev.

---

## Gmail Access — Service Account + Domain-Wide Delegation

This app uses a **Google service account with Domain-Wide Delegation (DWD)** to read Gmail inboxes. No OAuth login flow, no refresh tokens, no browser redirects.

| | Value |
|---|---|
| Service account | `orders-inbox-gmail@in-demand-87605.iam.gserviceaccount.com` |
| DWD Client ID | `106564913808177875637` |
| Scope | `https://www.googleapis.com/auth/gmail.readonly` |

### DWD setup (one-time, already done for Phase 1)

1. Google Workspace Admin → Security → API Controls → Manage Domain-Wide Delegation
2. Add entry:
   - Client ID: `106564913808177875637`
   - Scope: `https://www.googleapis.com/auth/gmail.readonly`
3. Save — allow up to a few hours for propagation

### Rotating credentials

1. GCP Console → IAM → Service Accounts → `orders-inbox-gmail` → Keys → Add Key → JSON
2. Upload the new JSON to Secret Manager: `orders-inbox-google-credentials`
3. Redeploy (or restart) the Cloud Run service to pick up the new secret version
4. Delete the old key from GCP and from your machine

### Adding a new inbox (Phase 2)

To add `ordersuk@fablefood.co`:
1. Ensure the service account has DWD access to `ordersuk@fablefood.co` in Google Workspace Admin (same DWD entry, no changes needed if scope already covers the domain)
2. Insert a row: `INSERT INTO inboxes (id, email, display_name) VALUES ('orders-uk', 'ordersuk@fablefood.co', 'UK')`
3. The sync endpoint accepts `inboxId=orders-uk` — no code changes required

---

## Local Development

```bash
# Install server dependencies
npm install

# Install client dependencies
cd client && npm install && cd ..

# Copy and fill in env vars
cp .env.example .env

# Build the React client
npm run build:client

# Start the server
npm start
# → http://localhost:8080/orders/
```

**Hot-reload during frontend development:**

```bash
# Terminal 1 — backend
npm run dev

# Terminal 2 — Vite dev server (proxies /orders/api/* to :8080)
cd client && npm run dev
# → http://localhost:5173/orders/
```

---

## Deployment

### Deploy via Cloud Build (standard)

```bash
gcloud builds submit . --project in-demand-87605
```

`cloudbuild.yaml` does three steps:
1. Build Docker image with `VITE_BASE_PATH=/orders` build arg
2. Push to `gcr.io/in-demand-87605/orders-inbox`
3. Deploy to Cloud Run `orders-inbox` — mounts `orders-inbox-google-credentials` and `orders-inbox-anthropic-key` from Secret Manager

### GCP infrastructure (already provisioned)

| Resource | Name |
|---|---|
| Cloud Run service | `orders-inbox` |
| Container image | `gcr.io/in-demand-87605/orders-inbox` |
| Serverless NEG | `orders-inbox-neg` |
| LB backend service | `orders-inbox-backend` |
| LB path rules | `/orders`, `/orders/*` → `orders-inbox-backend` |
| IAP | Enabled — `group:all@fablefood.co` + `user:jidavis@fablefood.co` |
| Secret Manager | `orders-inbox-google-credentials`, `orders-inbox-anthropic-key` |
