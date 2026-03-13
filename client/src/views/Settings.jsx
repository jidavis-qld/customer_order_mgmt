import React, { useState, useEffect } from 'react';

const BASE_API = import.meta.env.VITE_BASE_PATH || '/orders';

const s = {
  page:      { padding: '1.5rem', maxWidth: '700px' },
  title:     { fontSize: '1.3rem', fontWeight: 700, marginBottom: '1.25rem' },
  card:      { background: '#fff', borderRadius: '8px', padding: '1.25rem 1.5rem', marginBottom: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' },
  cardTitle: { fontWeight: 700, fontSize: '1rem', marginBottom: '0.9rem', color: '#1a1a2e', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' },
  row:       { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem', flexWrap: 'wrap' },
  label:     { fontSize: '0.82rem', color: '#666', width: '150px', flexShrink: 0 },
  value:     { fontSize: '0.9rem', color: '#1a1a1a', fontWeight: 500 },
  ok:        { color: '#2d6a4f', fontWeight: 700, fontSize: '0.85rem' },
  notok:     { color: '#c0392b', fontWeight: 700, fontSize: '0.85rem' },
  btn:       { padding: '0.4rem 0.9rem', borderRadius: '6px', border: '1px solid #2d6a4f', background: '#fff', color: '#2d6a4f', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 },
  note:      { fontSize: '0.82rem', color: '#888', marginTop: '0.5rem', lineHeight: 1.5 },
  section:   { marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f0f0f0' },
};

function Row({ label, children }) {
  return (
    <div style={s.row}>
      <span style={s.label}>{label}</span>
      {children}
    </div>
  );
}

export default function Settings() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

      {/* Gmail Connections */}
      <div style={s.card}>
        <div style={s.cardTitle}>Gmail Inboxes</div>

        {loading && <div>Loading…</div>}
        {error && <div style={{ color: '#c0392b' }}>{error}</div>}

        {status?.inboxes?.map(inbox => (
          <div key={inbox.id} style={s.section}>
            <Row label="Inbox">
              <span style={s.value}>{inbox.email}</span>
              <span style={{ fontSize: '0.78rem', color: '#999' }}>({inbox.display_name})</span>
            </Row>
            <Row label="Status">
              {inbox.connected
                ? <span style={s.ok}>✓ Connected</span>
                : <span style={s.notok}>✗ Not connected</span>}
            </Row>
            {inbox.last_synced_at && (
              <Row label="Last synced">
                <span style={s.value}>
                  {new Date(inbox.last_synced_at).toLocaleString('en-AU')}
                </span>
              </Row>
            )}
            <Row label="">
              <a
                href={`${BASE_API}/auth/setup?inbox=${inbox.id}`}
                style={s.btn}
              >
                {inbox.connected ? 'Re-authenticate' : 'Connect Gmail'}
              </a>
            </Row>
          </div>
        ))}

        <p style={s.note}>
          To connect a Gmail inbox for the first time, click "Connect Gmail" above.
          You will be redirected to Google to grant read-only access to the inbox.
          Once authorised, return here — the inbox status will show "Connected".
        </p>
        <p style={{ ...s.note, marginTop: '0.4rem' }}>
          Future inboxes (ordersuk@fablefood.co, ordersus@fablefood.co) will appear
          here when configured.
        </p>
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
          from the connected Gmail inbox and extracts structured order data. No emails are sent,
          no data is modified. All Gmail access is read-only (gmail.readonly scope).
        </p>
      </div>
    </div>
  );
}
