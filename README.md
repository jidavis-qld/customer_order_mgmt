# customer_order_mgmt — Fable Food PO Inbox

A read-only web application that connects to the Fable Food Gmail group inbox (`orders@fablefood.co`), fetches incoming Purchase Order emails, extracts structured order data from email bodies and PDF attachments using Claude, and presents a clean dashboard for the team.

**Phase 1 — Read Only.** No emails are sent. No data is modified. Gmail access is strictly `gmail.readonly`.

Live URL: `https://app.fablefood.co/orders/`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| Frontend | React 18 + Vite (served by Express) |
| AI Extraction | Anthropic Claude (`claude-sonnet-4-6`) |
| PDF Parsing | `pdf-parse` |
| Database | SQLite (`better-sqlite3`) |
| Auth | Google OAuth 2.0 (gmail.readonly scope) |
| Deployment | GCP Cloud Run (`australia-southeast1`) |
| Registry | GCR `gcr.io/in-demand-87605/orders-inbox` |

---

## Local Development

### Prerequisites

- Node.js 20+
- A `.env` file — copy `.env.example` and fill in the values

### Setup

```bash
# Clone and install server dependencies
git clone https://github.com/jidavis-qld/customer_order_mgmt.git
cd customer_order_mgmt
npm install

# Install client dependencies
cd client && npm install && cd ..

# Copy and fill in environment variables
cp .env.example .env
# Edit .env with your credentials

# Build the React client
npm run build:client

# Start the server
npm start
```

Open `http://localhost:8080/orders/`.

For frontend hot-reload during development:
```bash
# Terminal 1: Start the backend
npm run dev

# Terminal 2: Start the Vite dev server (proxies API calls to :8080)
cd client && npm run dev
```

Vite dev server runs at `http://localhost:5173/orders/`.

### Gmail OAuth (first-time setup)

1. Create a Google Cloud OAuth 2.0 credential at https://console.cloud.google.com
   - Application type: Web application
   - Authorised redirect URI: `http://localhost:8080/orders/auth/callback` (dev) or `https://app.fablefood.co/orders/auth/callback` (prod)
2. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` in `.env`
3. Visit `http://localhost:8080/orders/auth/setup`
4. Complete the Google OAuth consent flow — grant access to `orders@fablefood.co`
5. The refresh token is automatically saved to the SQLite database
6. For production: copy the token and add it as `GMAIL_REFRESH_TOKEN` in Cloud Run env vars

---

## Environment Variables

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Must match the redirect URI in Google Cloud Console |
| `GMAIL_REFRESH_TOKEN` | Obtained after first OAuth run; persists across restarts |
| `ANTHROPIC_API_KEY` | Anthropic API key (https://console.anthropic.com) |
| `SESSION_SECRET` | Random secret for Express sessions (`openssl rand -hex 32`) |
| `PORT` | Server port (default: `8080`, Cloud Run default) |
| `APP_BASE_PATH` | URL path prefix (default: `/orders`) |
| `DB_PATH` | SQLite file path (default: `./orders.sqlite`) |

---

## Deployment to Cloud Run

### Prerequisites

- `gcloud` CLI authenticated with `in-demand-87605` project
- Docker installed locally (or use Cloud Build)

### Build and deploy via Cloud Build

```bash
gcloud builds submit . \
  --project in-demand-87605
```

This uses `cloudbuild.yaml` to:
1. Build the Docker image
2. Push to `gcr.io/in-demand-87605/orders-inbox`
3. Deploy to Cloud Run as `orders-inbox` in `australia-southeast1`

### Set environment variables in Cloud Run

After the first deploy, set secrets in the GCP Console:
- Cloud Run → `orders-inbox` → Edit & Deploy → Variables & Secrets

Add all variables from the table above. For `GMAIL_REFRESH_TOKEN`, run the OAuth flow locally first to obtain the token, then paste it here.

### Add path rule to the load balancer

Follow the pattern from `in_demandSOP`:

1. GCP Console → Network Services → Load Balancing → `fablefood-apps-lb`
2. Host and path rules → Add path rule:
   - Path: `/orders/*`
   - Backend: Create a new Serverless NEG pointing to Cloud Run service `orders-inbox`
3. Also add `/orders` (without trailing slash) to avoid redirect issues

---

## Project Structure

```
customer_order_mgmt/
├── server/
│   ├── index.js      # Express entry point — API routes + static file serving
│   ├── auth.js       # Google OAuth 2.0 flow
│   ├── gmail.js      # Gmail API client (READ ONLY)
│   ├── pdf.js        # PDF text extraction via pdf-parse
│   ├── extract.js    # Claude API extraction + SQLite caching
│   └── db.js         # SQLite schema + query functions
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   └── views/
│   │       ├── Inbox.jsx      # PO list view with filters
│   │       ├── PODetail.jsx   # Individual PO detail
│   │       └── Settings.jsx   # Gmail/Claude connection status
│   ├── vite.config.js
│   └── package.json
├── Dockerfile
├── cloudbuild.yaml
├── .env.example
└── package.json
```

---

## Multi-Inbox Support (Future)

The database schema and auth layer are designed to support multiple inboxes from day one. To add `ordersuk@fablefood.co` or `ordersus@fablefood.co` (Phase 2):

1. Insert a new row into the `inboxes` table
2. Visit `/orders/auth/setup?inbox=orders-uk` to authenticate that inbox
3. Use the `inboxId` filter in the API to scope syncs and email lists

No schema changes required.

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/orders/api/emails` | List POs. Query params: `dateFrom`, `dateTo`, `customer`, `flagged`, `unread`, `inboxId` |
| `GET` | `/orders/api/emails/:id` | PO detail + extracted data + attachments |
| `POST` | `/orders/api/sync` | Trigger Gmail fetch + extraction. Body: `{ inboxId, dateFrom, dateTo, maxResults }` |
| `GET` | `/orders/api/auth/status` | Gmail + Claude connection status |
| `GET` | `/orders/auth/setup` | Initiate Gmail OAuth flow. Query param: `inbox` (default: `orders-au`) |
| `GET` | `/orders/auth/callback` | OAuth callback (handled automatically by Google redirect) |
