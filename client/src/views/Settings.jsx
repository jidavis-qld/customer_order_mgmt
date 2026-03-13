import React, { useState, useEffect } from 'react';
import { C, T, F } from '../design.js';

const BASE_API = import.meta.env.VITE_BASE_PATH || '/orders';

const s = {
  page:      { padding: '1.5rem', maxWidth: '700px' },
  title:     { fontSize: T.lg, fontWeight: T.bold, color: C.forest, marginBottom: '1.25rem' },
  card:      { ...F.card },
  cardTitle: { ...F.cardTitle },
  row:       { display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.6rem', flexWrap: 'wrap' },
  label:     { fontSize: T.sm, color: C.sage, width: '170px', flexShrink: 0, paddingTop: '0.1rem' },
  value:     { fontSize: T.base, color: C.forest, fontWeight: T.bold },
  ok:        { color: C.olive,     fontWeight: T.bold, fontSize: T.sm },
  notok:     { color: C.errorText, fontWeight: T.bold, fontSize: T.sm },
  mono:      { fontFamily: 'monospace', fontSize: T.xs, background: C.sagePale, padding: '0.15rem 0.4rem', borderRadius: '4px', color: C.forest },
  note:      { fontSize: T.sm, color: C.sage, marginTop: '0.75rem', lineHeight: 1.6 },
  divider:   { borderBottom: `1px solid ${C.sageLight}`, marginBottom: '0.75rem', paddingBottom: '0.75rem' },
  error:     { ...F.errorBox },
};

function Row({ label, children }) {
  return (
    <div style={s.row}>
      <span style={s.label}>{label}</span>
      <span>{children}</span>
    </div>
  );
}

export default function Settings() {
  const [status, setStatus]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${BASE_API}/api/auth/status`);
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        setStatus(await res.json());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div style={s.page}>
      <h2 style={s.title}>Settings</h2>

      {/* Gmail access */}
      <div style={s.card}>
        <div style={s.cardTitle}>Gmail Access</div>
        {loading && <div>Loading…</div>}
        {error && <div style={s.error}>{error}</div>}

        {status && (
          <>
            <Row label="Auth method">
              <span style={s.value}>Service Account + Domain-Wide Delegation</span>
            </Row>
            <Row label="Credentials source">
              <span style={{ ...s.mono }}>
                {status.credentials_source === 'none' ? 'Not configured' : status.credentials_source}
              </span>
            </Row>
            <Row label="Credentials status">
              {status.credentials_ok
                ? <span style={s.ok}>✓ Configured</span>
                : <span style={s.notok}>✗ Not configured — set GOOGLE_CREDENTIALS_JSON</span>}
            </Row>

            <div style={{ ...s.divider, marginTop: '0.75rem' }} />

            {status.inboxes?.map(inbox => (
              <div key={inbox.id} style={{ marginBottom: '0.5rem' }}>
                <Row label="Inbox">
                  <span style={s.value}>{inbox.email}</span>
                  <span style={{ fontSize: '0.78rem', color: '#999', marginLeft: '0.4rem' }}>({inbox.display_name})</span>
                </Row>
                <Row label="Access">
                  {inbox.connected
                    ? <span style={s.ok}>✓ Ready (DWD impersonation)</span>
                    : <span style={s.notok}>✗ Awaiting credentials</span>}
                </Row>
                {inbox.last_synced_at && (
                  <Row label="Last synced">
                    <span style={s.value}>
                      {new Date(inbox.last_synced_at).toLocaleString('en-AU')}
                    </span>
                  </Row>
                )}
              </div>
            ))}

            <p style={s.note}>
              This app uses a Google service account with Domain-Wide Delegation to read
              each inbox — no OAuth login flow required. To set up or rotate credentials,
              update the <span style={s.mono}>GOOGLE_CREDENTIALS_JSON</span> environment
              variable in Cloud Run with the service account key JSON.
            </p>
            <p style={{ ...s.note, marginTop: '0.4rem' }}>
              Future inboxes (ordersuk@fablefood.co, ordersus@fablefood.co) will appear
              here when configured in Google Workspace Admin.
            </p>
          </>
        )}
      </div>

      {/* Claude API */}
      <div style={s.card}>
        <div style={s.cardTitle}>Claude API</div>
        {status && (
          <>
            <Row label="Model">
              <span style={s.value}>{status.claude_model}</span>
            </Row>
            <Row label="API Key">
              {status.claude_configured
                ? <span style={s.ok}>✓ Configured</span>
                : <span style={s.notok}>✗ ANTHROPIC_API_KEY not set</span>}
            </Row>
          </>
        )}
      </div>

      {/* Phase info */}
      <div style={s.card}>
        <div style={s.cardTitle}>About</div>
        <p style={s.note}>
          <strong>Phase 1 — Read Only.</strong> This application reads Purchase Order emails
          from the connected Gmail inboxes and extracts structured order data. No emails are
          sent, no data is modified. All Gmail access is read-only (gmail.readonly scope).
        </p>
      </div>
    </div>
  );
}
